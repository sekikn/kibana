/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import moment from 'moment';
import { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from 'src/core/public';
import { DataPublicPluginSetup, DataPublicPluginStart } from '../../../../src/plugins/data/public';
import { BfetchPublicSetup } from '../../../../src/plugins/bfetch/public';
import { ManagementSetup } from '../../../../src/plugins/management/public';
import { SharePluginStart } from '../../../../src/plugins/share/public';

import { setAutocompleteService } from './services';
import { setupKqlQuerySuggestionProvider, KUERY_LANGUAGE_NAME } from './autocomplete';
import { EnhancedSearchInterceptor } from './search/search_interceptor';
import { registerSearchSessionsMgmt } from './search/sessions_mgmt';
import { toMountPoint } from '../../../../src/plugins/kibana_react/public';
import { createConnectedSearchSessionIndicator } from './search';
import { ConfigSchema } from '../config';
import { Storage } from '../../../../src/plugins/kibana_utils/public';

export interface DataEnhancedSetupDependencies {
  bfetch: BfetchPublicSetup;
  data: DataPublicPluginSetup;
  management: ManagementSetup;
}
export interface DataEnhancedStartDependencies {
  data: DataPublicPluginStart;
  share: SharePluginStart;
}

export type DataEnhancedSetup = ReturnType<DataEnhancedPlugin['setup']>;
export type DataEnhancedStart = ReturnType<DataEnhancedPlugin['start']>;

export class DataEnhancedPlugin
  implements Plugin<void, void, DataEnhancedSetupDependencies, DataEnhancedStartDependencies> {
  private enhancedSearchInterceptor!: EnhancedSearchInterceptor;
  private config!: ConfigSchema;
  private readonly storage = new Storage(window.localStorage);

  constructor(private initializerContext: PluginInitializerContext<ConfigSchema>) {}

  public setup(
    core: CoreSetup<DataEnhancedStartDependencies>,
    { bfetch, data, management }: DataEnhancedSetupDependencies
  ) {
    data.autocomplete.addQuerySuggestionProvider(
      KUERY_LANGUAGE_NAME,
      setupKqlQuerySuggestionProvider(core)
    );

    this.enhancedSearchInterceptor = new EnhancedSearchInterceptor({
      bfetch,
      toasts: core.notifications.toasts,
      http: core.http,
      uiSettings: core.uiSettings,
      startServices: core.getStartServices(),
      usageCollector: data.search.usageCollector,
      session: data.search.session,
    });

    data.__enhance({
      search: {
        searchInterceptor: this.enhancedSearchInterceptor,
      },
    });

    this.config = this.initializerContext.config.get<ConfigSchema>();
    if (this.config.search.sessions.enabled) {
      const sessionsConfig = this.config.search.sessions;
      registerSearchSessionsMgmt(core, sessionsConfig, { management });
    }
  }

  public start(core: CoreStart, plugins: DataEnhancedStartDependencies) {
    setAutocompleteService(plugins.data.autocomplete);

    if (this.config.search.sessions.enabled) {
      core.chrome.setBreadcrumbsAppendExtension({
        content: toMountPoint(
          React.createElement(
            createConnectedSearchSessionIndicator({
              sessionService: plugins.data.search.session,
              application: core.application,
              timeFilter: plugins.data.query.timefilter.timefilter,
              storage: this.storage,
              disableSaveAfterSessionCompletesTimeout: moment
                .duration(this.config.search.sessions.notTouchedTimeout)
                .asMilliseconds(),
            })
          )
        ),
      });
    }
  }

  public stop() {
    this.enhancedSearchInterceptor.stop();
  }
}
