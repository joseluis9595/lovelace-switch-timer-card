import { html, LitElement, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { version } from '../package.json';
import { getDefaultStyles } from './styles';
import { HomeAssistant } from 'custom-card-helpers';
import { DEFAULT_CONFIG, SwitchTimerCardConfig } from './config';
import {
  convertCardConfigTimeToSeconds,
  homeAssistantFormatTime,
  humanReadableTime,
} from './utils';

declare global {
  interface Window {
    customCards: Array<object>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'switch-timer-card',
  name: 'Switch timer card',
  preview: true,
  description: 'Card to turn ON a switch for a given time indicated by a timer',
});

@customElement('switch-timer-card')
export class SwitchTimerCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config!: SwitchTimerCardConfig;
  @state() private _minimized = true;
  // TODO replace with hass `timer` service
  @state() private _timeRemaining: number | undefined;
  @state() private _interval: number | undefined;
  @state() private _unique_id: string | undefined;

  static styles = getDefaultStyles();

  private _longPressTimer: NodeJS.Timeout | undefined;
  private _longPressed = false;

  connectedCallback() {
    super.connectedCallback();
    this._minimized =
      localStorage.getItem(this.getLocalStorageKey()) === 'true';
  }

  setConfig(config) {
    if (!config.switch_entity) {
      throw new Error("You need to define param 'switch_entity'");
    }
    if (!config.timer_entity) {
      throw new Error("You need to define param 'timer_entity'");
    }
    this._config = { ...DEFAULT_CONFIG, ...config };
    // TODO wtf...
    this._unique_id = `${config.timer_entity}_${config.switch_entity}_${window.location.href}`;
  }

  protected shouldUpdate(_changedProps: PropertyValues): boolean {
    if (!this._config) return false;
    if (_changedProps.has('_timeRemaining')) return true;
    return super.shouldUpdate(_changedProps);

    // const hasChanged1 = hasConfigOrEntityChanged(
    //   this,
    //   this._config?.timer_entity,
    //   changedProps,
    //   false,
    // );
    // const hasChanged2 = hasConfigOrEntityChanged(
    //   this,
    //   this._config?.switch_entity,
    //   changedProps,
    //   false,
    // );
    // return hasChanged1 || hasChanged2;
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    // Start a timer if the timer entity is changed (will also be triggered on the first render)
    if (changedProps.has('hass')) {
      const stateObj = this.hass?.states[this._config?.timer_entity];
      const oldStateObj =
        changedProps.get('hass')?.states[this._config?.timer_entity];

      if (oldStateObj !== stateObj) {
        this._startInterval(stateObj);
      } else if (!stateObj) {
        this._clearInterval();
      }
    }
  }

  _startIconLongPressTimer(entity) {
    this._longPressed = false;
    this._longPressTimer = setTimeout(() => {
      this._longPressed = true;
      this.open_more_info(entity.entity_id);
    }, 500);
  }

  _handleOnIconMouseDown(entity) {
    this._startIconLongPressTimer(entity);
  }

  _handleOnIconTouchStart(entity) {
    this._startIconLongPressTimer(entity);
  }

  _handleOnIconMouseUp(_entity) {
    clearTimeout(this._longPressTimer);
  }

  _handleOnIconTouchEnd(_entity) {
    clearTimeout(this._longPressTimer);
  }

  _handleOnIconClick(event, entity) {
    if (!this._longPressed) {
      this.toggleSwitch(entity, entity.state === 'on' ? false : true);
    }
    event.preventDefault();
    event.stopPropagation();
  }

  _clearInterval() {
    if (this._interval) {
      window.clearInterval(this._interval);
      this._interval = undefined;
    }
  }

  _startInterval(stateObj) {
    this._clearInterval();
    this._updateRemainingTime(stateObj);

    if (this.hass.states[this._config.timer_entity]?.state == 'active') {
      this._interval = window.setInterval(
        () => this._updateRemainingTime(stateObj),
        1000,
      );
    }
  }

  _updateRemainingTime(stateObj) {
    const currentDate = new Date().getTime() / 1000;
    const finishesAt = stateObj?.attributes?.finishes_at;
    if (finishesAt == null) {
      this._timeRemaining = undefined;
      return;
    }
    const finishingDate = new Date(finishesAt).getTime() / 1000;
    const seconds = finishingDate - currentDate;

    this._timeRemaining = Math.floor(seconds);
  }

  _calculateTimerProgress(timerEntity, secondsRemaining) {
    const totalTime = timerEntity?.attributes?.duration;
    if (!totalTime || !secondsRemaining) return 100;
    const splits = totalTime.split(':');
    const totalSeconds =
      parseInt(splits[0]) * 60 * 60 +
      parseInt(splits[1]) * 60 +
      parseInt(splits[2]);
    return (secondsRemaining / totalSeconds) * 100;
  }

  render() {
    if (!this.hass || !this._config) {
      return html``;
    }

    const switchEntity = this.hass.states[this._config.switch_entity];
    if (!switchEntity) {
      return html`<ha-card
        >Unknown entity ${this._config.switch_entity}</ha-card
      >`;
    }

    const timerEntity = this.hass.states[this._config.timer_entity];
    if (!timerEntity) {
      return html`<ha-card
        >Unknown entity ${this._config.timer_entity}</ha-card
      >`;
    }

    // <div class="card-hint">
    //     This card controls ${switchEntity.attributes.friendly_name || switchEntity.attributes.entity_id}
    //     making use of the timer ${timerEntity.attributes.friendly_name || timerEntity.attributes.entity_id}
    // </div>

    // <div class="switch-container entity-row">
    //   <div class="entity-row-title">Manual control</div>
    //   <ha-switch
    //     @change=${(ev) => this.toggleSwitch(switchEntity, ev.currentTarget.checked)}
    //     .checked=${switchEntity.state === 'on'}
    //     haptic=true
    //   >
    //   </ha-switch>
    // </div>

    // <div class="timer-container entity-row">
    //   <div class="entity-row-title">Remaining time</div>
    //   ${this._humanReadableSeconds(this._timeRemaining)}
    // </div>

    return html`
      <ha-card class=${switchEntity.state === 'on' ? 'active-color' : ''}>
        <div class="container">
          <div class="header" @click=${this.toggleMinimized}>
            <div
              class="header-icon"
              @click=${e => this._handleOnIconClick(e, switchEntity)}
              @mousedown=${() => this._handleOnIconMouseDown(switchEntity)}
              @mouseup=${() => this._handleOnIconMouseUp(switchEntity)}
              @touchstart=${() => this._handleOnIconTouchStart(switchEntity)}
              @touchend=${() => this._handleOnIconTouchEnd(switchEntity)}
              @contextmenu=${event => {
                event.stopPropagation();
                event.preventDefault();
              }}>
              <ha-icon id="radiator-icon" icon="mdi:radiator"></ha-icon>
            </div>
            <div class="header-title">
              ${this._config.title ||
              switchEntity.attributes.friendly_name ||
              switchEntity.attributes.entity_id}
              <div class="header-minimized-timer">
                ${this._timeRemaining
                  ? humanReadableTime(this._timeRemaining)
                  : `Off`}
              </div>
            </div>
            <div
              class="icon-button"
              @click=${e => {
                e.stopPropagation();
                this.open_more_info(timerEntity.entity_id);
              }}>
              <ha-icon id="timer" icon="mdi:timer-sand"></ha-icon>
            </div>
            <div
              class="icon-button"
              @click=${e => {
                e.stopPropagation();
                this.toggleMinimized();
              }}>
              <ha-icon
                id="minimize_icon"
                icon="${this._minimized
                  ? 'mdi:chevron-down'
                  : 'mdi:chevron-up'}"></ha-icon>
            </div>
          </div>

          <div class="card-content ${this._minimized && 'minimized'}">
            ${!this._minimized
              ? html`
                  ${timerEntity.state == 'active'
                    ? html` <div class="entity-row progress-container">
                        <progress
                          class="progress-bar"
                          max="100"
                          value="${this._calculateTimerProgress(
                            timerEntity,
                            this._timeRemaining,
                          )}"></progress>
                        <div
                          class="icon-button"
                          @click=${() => this.cancelButtonClicked(timerEntity)}>
                          <ha-icon
                            id="cancel-timer-icon"
                            icon="mdi:close"></ha-icon>
                        </div>
                      </div>`
                    : html``}

                  <div class="timer-button-container">
                    ${this._config.buttons?.map(button => {
                      const seconds = convertCardConfigTimeToSeconds(button);
                      return html`
                        <button
                          class="timer-button"
                          @click=${() =>
                            this.buttonClicked(timerEntity, seconds)}>
                          ${button.text || humanReadableTime(seconds)}
                        </button>
                      `;
                    })}
                  </div>
                `
              : html``}
          </div>
        </div>
      </ha-card>
    `;
  }

  buttonClicked(timerEntity, seconds: number) {
    const duration = homeAssistantFormatTime(seconds);
    this.hass.callService('timer', 'start', {
      duration: duration,
      entity_id: timerEntity.entity_id,
    });
  }

  cancelButtonClicked(timerEntity) {
    this.hass.callService('timer', 'cancel', {
      entity_id: timerEntity.entity_id,
    });
  }

  toggleSwitch(switchEntity, turnOn) {
    if (!switchEntity) return;
    this.hass.callService('homeassistant', turnOn ? 'turn_on' : 'turn_off', {
      entity_id: switchEntity.entity_id,
    });
  }

  getLocalStorageKey() {
    return `switch-timer-card_${this._unique_id}`;
  }

  setMinimized(minimized: boolean) {
    this._minimized = minimized;
    localStorage.setItem(this.getLocalStorageKey(), this._minimized.toString());
  }

  toggleMinimized() {
    this.setMinimized(!this._minimized);
  }

  open_more_info(entity_id) {
    const event = new Event('hass-more-info', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event as any).detail = { entityId: entity_id };
    this.dispatchEvent(event);
  }
}

console.info(
  `%c switch-timer-card%cv${version} `,
  // Card name styles
  `background-color: #555;
      padding: 6px 8px;
      padding-right: 6px;
      color: #fff;
      font-weight: 800;
      font-family: 'Segoe UI', Roboto, system-ui, sans-serif;
      text-shadow: 0 1px 0 rgba(1, 1, 1, 0.3); 
      border-radius: 16px 0 0 16px;`,
  // Card version styles
  `background-color:rgb(0, 135, 197);
      padding: 6px 8px;
      padding-left: 6px;
      color: #fff;
      font-weight: 800;
      font-family: 'Segoe UI', Roboto, system-ui, sans-serif;
      text-shadow: 0 1px 0 rgba(1, 1, 1, 0.3); 
      border-radius: 0 16px 16px 0;`,
);
