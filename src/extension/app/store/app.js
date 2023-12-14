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

/* eslint-disable no-undef */

import { observable } from 'mobx';
import { UserStore } from './user.js';
import { SiteStore } from './site.js';
import { getAdminUrl, getAdminFetchOptions } from '../utils/helix-admin.js';
import sampleRUM from '../utils/rum.js';
import { fetchLanguageDict } from '../utils/i18n.js';
import { getLocation, matchProjectHost, isSupportedFileExtension } from '../utils/browser.js';

/**
 * @typedef {Object} Plugin
 * @description The plugin configuration.
 * @prop {string} id The plugin ID (mandatory)
 * @prop {string} title The button text
 * @prop {Object} titleI18n={} A map of translated button texts
 * @prop {string} url The URL to open when the button is clicked
 * @prop {boolean} passConfig Append additional sk info to the url as query parameters:
 *                          ref, repo, owner, host, project
 * @prop {boolean} passReferrer Append the referrer URL as a query param on new URL button click
 * @prop {string} event The name of a custom event to fire when the button is clicked.
 *                      Note: Plugin events get a custom: prefix, e.g. "foo" becomes "custom:foo".
 * @prop {string} containerId The ID of a dropdown to add this plugin to (optional)
 * @prop {boolean} isContainer Determines whether to turn this plugin into a dropdown
 * @prop {boolean} isPalette Determines whether a URL is opened in a palette instead of a new tab
 * @prop {string} paletteRect The dimensions and position of a palette (optional)
 * @prop {string[]} environments Specifies when to show this plugin
 *                               (admin, edit, dev, preview, live, prod)
 * @prop {string[]} excludePaths Exclude the plugin from these paths (glob patterns supported)
 * @prop {string[]} includePaths Include the plugin on these paths (glob patterns supported)
 */

class AppStore {
  @observable accessor initialized = false;

  /**
   * The current location
   * @type {URL}
   */
  location;

  /**
   * The sidekick element
   * @type {HTMLElement}
   */
  sidekick;

  /**
   * Status of the current document
   * @type {object}
   */
  status = {};

  /**
   * Dictionary of language keys
   * @type {object}
   */
  languageDict;

  /**
   * The plugins
   * @type {Plugin[]}
   */
  plugins;

  constructor() {
    this.userStore = new UserStore(this);
    this.siteStore = new SiteStore(this);
  }

  /**
   * Loads the sidekick configuration and language dictionary,
   * and retrieves the location of the current document.
   * @param {SidekickConfig} cfg The sidekick config
   * @fires Sidekick#contextloaded
   * @returns {Sidekick} The sidekick
   */
  async loadContext(sidekick, cfg) {
    this.sidekick = sidekick;
    this.location = getLocation();

    await this.siteStore.initStore(cfg);

    // load dictionary based on user language
    this.languageDict = await fetchLanguageDict(this.siteStore);
    if (!this.languageDict.title) {
      // unsupported language, default to english
      this.languageDict = await fetchLanguageDict(this.siteStore, 'en');
    }
    this.fireEvent('contextloaded', {
      config: this.siteStore.toJSON(),
      location: this.location,
    });

    this.fetchStatus();
  }

  /**
   * Checks if the current location is a development URL.
   * @returns {boolean} <code>true</code> if development URL, else <code>false</code>
   */
  isDev() {
    const { siteStore, location } = this;
    return [
      '', // for unit testing
      siteStore.devUrl.host, // for development and browser testing
    ].includes(location.host);
  }

  /**
   * Checks if the current location is an inner CDN URL.
   * @returns {boolean} <code>true</code> if inner CDN URL, else <code>false</code>
   */
  isInner() {
    const { siteStore, location } = this;
    return matchProjectHost(siteStore.innerHost, location.host)
       || matchProjectHost(siteStore.stdInnerHost, location.host);
  }

  /**
   * Checks if the current location is an outer CDN URL.
   * @returns {boolean} <code>true</code> if outer CDN URL, else <code>false</code>
   */
  isOuter() {
    const { siteStore, location } = this;
    return matchProjectHost(siteStore.outerHost, location.host)
        || matchProjectHost(siteStore.stdOuterHost, location.host);
  }

  /**
   * Checks if the current location is a production URL.
   * @returns {boolean} <code>true</code> if production URL, else <code>false</code>
   */
  isProd() {
    const { siteStore, location } = this;
    return siteStore.host === location.host;
  }

  /**
   * Checks if the current location is an admin URL (SharePoint or Google Drive).
   * @returns {boolean} <code>true</code> if admin URL, else <code>false</code>
   */
  isAdmin() {
    const { location } = this;
    return this.isSharePointFolder(location) || location.host === 'drive.google.com';
  }

  /**
   * Checks if the current location is a configured project URL.
   * @returns {boolean} <code>true</code> if project URL, else <code>false</code>
   */
  isProject() {
    const { siteStore } = this;
    return siteStore.owner && siteStore.repo
        && (this.isDev() || this.isInner() || this.isOuter() || this.isProd());
  }

  /**
   * Checks if the current location is an editor URL (SharePoint or Google Docs).
   * @returns {boolean} <code>true</code> if editor URL, else <code>false</code>
   */
  isEditor() {
    const { siteStore, location } = this;
    const { host } = location;
    if (this.isSharePointEditor(location) || this.isSharePointViewer(location)) {
      return true;
    }
    if (host === 'docs.google.com') {
      return true;
    }
    if (siteStore.mountpoint && new URL(siteStore.mountpoint).host === host && !this.isAdmin()) {
      return true;
    }
    return false;
  }

  /**
   * Checks if the user is logged in.
   * @returns {boolean} <code>true</code> if user is logged in (or does not need to be),
   * else <code>false</code>
   */
  isAuthenticated() {
    return !!this.status?.profile;
  }

  /**
   * Checks if the user is allowed to use a feature.
   * @param {string} feature The feature to check
   * @param {string} permission The permission to require
   * @returns {boolean} <code>true</code> if user is allowed, else <code>false</code>
   */
  isAuthorized(feature, permission) {
    if (!this.status[feature]) {
      // unknown feature
      return false;
    }
    if (!this.status[feature].permissions) {
      // feature doesn't require permissions
      return true;
    }
    return this.status[feature].permissions.includes(permission);
  }

  /**
   * Checks if the current location is a content URL.
   * @returns {boolean} <code>true</code> if content URL, else <code>false</code>
   */
  isContent() {
    const extSupported = isSupportedFileExtension(this.location.pathname);
    return this.isEditor() || this.isAdmin() || extSupported;
  }

  /**
   * Recognizes a SharePoint URL.
   * @private
   * @param {URL} url The URL
   * @returns {boolean} <code>true</code> if URL is SharePoint, else <code>false</code>
   */
  isSharePoint(url) {
    const { host } = url;
    const { mountpoint } = this.siteStore;
    return /\w+\.sharepoint.com$/.test(host)
        || (!host.endsWith('.google.com') && mountpoint && new URL(mountpoint).host === host);
  }

  /**
   * Recognizes a SharePoint document management URL.
   * @private
   * @param {URL} url The URL
   * @returns {boolean} <code>true</code> if URL is SharePoint DM, else <code>false</code>
   */
  isSharePointDM(url) {
    return this.isSharePoint(url)
      && (url.pathname.endsWith('/Forms/AllItems.aspx')
      || url.pathname.endsWith('/onedrive.aspx'));
  }

  /**
   * Recognizes a SharePoint folder URL.
   * @private
   * @param {URL} url The URL
   * @returns {boolean} <code>true</code> if URL is SharePoint folder, else <code>false</code>
   */
  isSharePointFolder(url) {
    if (this.isSharePointDM(url)) {
      const docPath = new URLSearchParams(url.search).get('id');
      const dotIndex = docPath?.split('/').pop().indexOf('.');
      return [-1, 0].includes(dotIndex); // dot only allowed as first char
    }
    return false;
  }

  /**
   * Recognizes a SharePoint editor URL.
   * @private
   * @param {URL} url The URL
   * @returns {boolean} <code>true</code> if URL is SharePoint editor, else <code>false</code>
   */
  isSharePointEditor(url) {
    const { pathname, search } = url;
    return this.isSharePoint(url)
      && pathname.match(/\/_layouts\/15\/[\w]+.aspx$/)
      && search.includes('sourcedoc=');
  }

  /**
   * Recognizes a SharePoint viewer URL.
   * @private
   * @param {URL} url The URL
   * @returns {boolean} <code>true</code> if URL is SharePoint viewer, else <code>false</code>
   */
  isSharePointViewer(url) {
    if (this.isSharePointDM(url)) {
      const docPath = new URLSearchParams(url.search).get('id');
      const dotIndex = docPath?.split('/').pop().lastIndexOf('.');
      return dotIndex > 0; // must contain a dot
    }
    return false;
  }

  /**
   * Fires an event with the given name.
   * @private
   * @param {string} name The name of the event
   * @param {Object} data The data to pass to event listeners (optional)
   */
  fireEvent(name, data) {
    try {
      const {
        sidekick, siteStore, location, status,
      } = this;
      data = data || {
        // turn complex into simple objects for event listener
        config: JSON.parse(siteStore.toJSON()),
        location: {
          hash: location.hash,
          host: location.host,
          hostname: location.hostname,
          href: location.href,
          origin: location.origin,
          pathname: location.pathname,
          port: location.port,
          protocol: location.protocol,
          search: location.search,
        },
        status,
      };
      sidekick.dispatchEvent(new CustomEvent(name, {
        detail: { data },
      }));
      const userEvents = [
        'shown',
        'hidden',
        'updated',
        'previewed',
        'published',
        'unpublished',
        'deleted',
        'envswitched',
        'loggedin',
        'loggedout',
        'helpnext',
        'helpdismissed',
        'helpacknowlegded',
        'helpoptedout',
      ];
      if (name.startsWith('custom:') || userEvents.includes(name)) {
        sampleRUM(`sidekick:${name}`, {
          source: data?.sourceUrl || this.location.href,
          target: data?.targetUrl || this.status.webPath,
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('failed to fire event', name, e);
    }
  }

  /**
     * Fetches the status for the current resource.
     * @fires Sidekick#statusfetched
     * @param {boolean} refreshLocation Refresh the sidekick's location (optional)
     * @returns {Sidekick} The sidekick
     */
  async fetchStatus(refreshLocation) {
    if (refreshLocation) {
      this.location = getLocation();
    }
    const { owner, repo, ref } = this.siteStore;
    if (!owner || !repo || !ref) {
      return this;
    }
    if (!this.status.apiUrl || refreshLocation) {
      const { href, pathname } = this.location;
      const isDM = this.isEditor() || this.isAdmin(); // is document management
      const apiUrl = getAdminUrl(
        this.siteStore,
        'status',
        isDM ? '' : pathname,
      );

      apiUrl.searchParams.append('editUrl', isDM ? href : 'auto');
      this.status.apiUrl = apiUrl;
    }

    fetch(this.status.apiUrl, {
      ...getAdminFetchOptions(),
    })
      .then((resp) => {
        // check for error status
        if (!resp.ok) {
          let errorKey = '';
          switch (resp.status) {
            case 401:
              // unauthorized, ask user to log in
              return {
                json: () => ({
                  status: 401,
                }),
              };
            case 404:
              errorKey = this.isEditor()
                ? 'error_status_404_document'
                : 'error_status_404_content';
              break;
            default:
              errorKey = `error_status_${resp.status}`;
          }
          throw new Error(errorKey);
        }
        return resp;
      })
      .then(async (resp) => {
        try {
          return resp.json();
        } catch (e) {
          throw new Error('error_status_invalid');
        }
      })
      .then((json) => {
        this.status = json;
        return json;
      })
      .then((json) => this.fireEvent('statusfetched', json))
      .catch(({ message }) => {
        this.status.error = message;
        // const modal = {
        //   message: message.startsWith('error_') ? i18n(this, message) : [
        //     i18n(this, 'error_status_fatal'),
        //     'https://status.hlx.live/',
        //   ],
        //   sticky: true,
        //   level: 0,
        //   callback: () => {
        //     // this error is fatal, hide and delete sidekick
        //     if (window.hlx.sidekick) {
        //       window.hlx.sidekick.hide();
        //       window.hlx.sidekick.replaceWith(''); // remove() doesn't work for custom element
        //       delete window.hlx.sidekick;
        //     }
        //   },
        // };
        // this.showModal(modal);
      });
    return this;
  }
}

export const appStore = new AppStore();
