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

import { html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { MobxLitElement } from '@adobe/lit-mobx';
import { appStore } from '../../store/app.js';
import { style } from './action-bar.css.js';
import { EXTERNAL_EVENTS } from '../../constants.js';

/**
 * @typedef {import('@Types')._Plugin} _Plugin
 */

@customElement('action-bar')
export class ActionBar extends MobxLitElement {
  static get styles() {
    return [style];
  }

  /**
   *
   * @param {_Plugin} plugin
   * @returns
   */
  createActionPluginButton(plugin) {
    if (typeof plugin.callback === 'function') {
      plugin.callback(appStore, plugin);
    }

    if (plugin.id === 'env-switcher') {
      return html`
        <env-switcher></env-switcher>
      `;
    }

    return html`
      <sp-action-button quiet @click=${() => this.onPluginButtonClick(plugin)}>
          ${plugin.button.text}
      </sp-action-button>
    `;
  }

  onPluginButtonClick(plugin) {
    appStore.fireEvent(EXTERNAL_EVENTS.PLUGIN_USED, {
      id: plugin.id,
    });
    plugin.button.action();
  }

  render() {
    return appStore.initialized ? html`
      <div class="action-bar">
        <sp-action-group>
          ${appStore.corePlugins?.map((plugin) => (plugin.condition(appStore) ? this.createActionPluginButton(plugin) : ''))}
        </sp-action-group>
        <sp-divider size="s" vertical></sp-divider>
        <sp-action-group>
          <sp-action-button quiet>
            <sp-icon-share slot="icon"></sp-icon-share>
          </sp-action-button>
        </sp-action-group>
        <sp-divider size="s" vertical></sp-divider>
        <sp-action-group>
          <sp-action-button quiet>
            <sp-icon-real-time-customer-profile slot="icon"></sp-icon-real-time-customer-profile>
          </sp-action-button>
        </sp-action-group>
      </div>
    ` : '';
  }
}
