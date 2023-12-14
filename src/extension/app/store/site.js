/*
 * Copyright 2023 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { getAdminUrl, getAdminFetchOptions } from '../utils/helix-admin.js';
import { getLanguage, i18n } from '../utils/i18n.js';

/**
 * @typedef {Object} ViewConfig
 * @description A custom view configuration.
 * @prop {string} path The path or globbing pattern where to apply this view
 * @prop {string} viewer The URL to render this view
 */

export class SiteStore {
  /**
   * The GitHub owner or organization (mandatory)
   * @type {string}
   */
  owner;

  /**
   * The GitHub repo (mandatory)
   * @type {string}
   */
  repo;

  /**
   * The Git reference or branch (optional)
   * @type {string}
   */
  ref;

  /**
   * The content source URL (optional)
   * @type {string[]}
   */
  mountpoint;

  /**
   * The name of the project used in the sharing link (optional)
   * @type {string}
   */
  project;

  /**
   * The production host name to publish content to (optional)
   * @type {string}
   */
  host;

  /**
   * The host name of a custom preview CDN (optional)
   * @type {string}
   */
  previewHost;

  /**
   * The host name of a custom live CDN (optional)
   * @type {string}
   */
  liveHost;

  /**
   * If the production host is a 3rd party CDN
   * @type {boolean}
   */
  byocdn;

  /**
   * Loads configuration and plugins from the development environment
   * @type {boolean}
   */
  devMode;

  /**
   * URL of the local development environment
   * @type {string}
   */
  devOrigin;

  /**
   * The specific version of admin service to use (optional)
   * @type {string}
   */
  adminVersion;

  /**
   * Inner CDN host name (custom or std)
   * @type {string}
   */
  innerHost;

  /**
   * Standard Inner CDN host name
   * @type {string}
   */
  stdInnerHost;

  /**
   * Inner CDN host name (custom or std)
   * @type {string}
   */
  outerHost;

  /**
   * Standard Outer CDN host name
   * @type {string}
   */
  stdOuterHost;

  /**
   * Extension script root
   * @type {string}
   */
  scriptRoot;

  /**
   * User language preference
   * @type {string}
   */
  lang;

  /**
   * Custom views
   * @type {ViewConfig[]}
   */
  views;

  constructor(appStore) {
    this.appStore = appStore;
  }

  async initStore(cfg) {
    let config = cfg || (window.hlx && window.hlx.sidekickConfig) || {};
    const {
      owner,
      repo,
      ref = 'main',
      mountpoint,
      devMode,
      adminVersion,
      _extended,
    } = config;
    let { devOrigin } = config;
    if (!devOrigin) {
      devOrigin = 'http://localhost:3000';
    }
    if (owner && repo && !_extended) {
      // look for custom config in project
      const configUrl = devMode
        ? `${devOrigin}/tools/sidekick/config.json`
        : getAdminUrl(config, 'sidekick', '/config.json');
      try {
        const res = await fetch(configUrl, getAdminFetchOptions(true));
        if (res.status === 200) {
          config = {
            ...config,
            ...(await res.json()),
            // no overriding below
            owner,
            repo,
            ref,
            devMode,
            adminVersion,
            _extended: Date.now(),
          };
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('error retrieving custom sidekick config', e);
      }
    }

    const {
      lang,
      previewHost,
      liveHost,
      outerHost: legacyLiveHost,
      host,
      project = '',
      specialViews,
      hlx5,
      scriptUrl = 'https://www.hlx.live/tools/sidekick/module.js',
      scriptRoot = scriptUrl.split('/').filter((_, i, arr) => i < arr.length - 1).join('/'),
    } = config;
    const publicHost = host && host.startsWith('http') ? new URL(host).host : host;
    const hostPrefix = owner && repo ? `${ref}--${repo}--${owner}` : null;
    const domain = hlx5 ? 'aem' : 'hlx';
    const stdInnerHost = hostPrefix ? `${hostPrefix}.${domain}.page` : null;
    const stdOuterHost = hostPrefix ? `${hostPrefix}.${domain}.live` : null;
    const devUrl = new URL(devOrigin);

    // default views
    this.views = [
      {
        path: '**.json',
        viewer: `${scriptRoot}/view/json/json.html`,
        title: (sk) => i18n(sk, 'json_view_description'),
      },
    ];
    // prepend custom views
    this.views = (specialViews || []).concat(this.views);

    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.mountpoint = mountpoint;
    this.devMode = devMode;
    this.adminVersion = adminVersion;
    this._extended = _extended;

    this.previewHost = previewHost;
    this.liveHost = liveHost;
    this.specialViews = specialViews;
    this.hlx5 = hlx5;
    this.scriptUrl = scriptUrl;

    this.innerHost = previewHost || stdInnerHost;
    this.outerHost = liveHost || legacyLiveHost || stdOuterHost;
    this.stdInnerHost = stdInnerHost;
    this.stdOuterHost = stdOuterHost;
    this.scriptRoot = scriptRoot;
    this.host = publicHost;
    this.project = project;
    this.devUrl = devUrl;
    this.lang = lang || getLanguage();

    this.appStore.initialized = true;
  }

  toJSON() {
    return {
      owner: this.owner,
      repo: this.repo,
      ref: this.ref,
      mountpoint: this.mountpoint,
      project: this.project,
      previewHost: this.previewHost,
      liveHost: this.liveHost,
      host: this.host,
      byocdn: this.byocdn,
      devMode: this.devMode,
      devOrigin: this.devOrigin,
      specialViews: this.specialViews,
      adminVersion: this.adminVersion,
    };
  }
}
