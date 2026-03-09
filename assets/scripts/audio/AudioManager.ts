import { _decorator, Component, AudioSource, AudioClip } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

@ccclass('AudioManager')
export class AudioManager extends Component {

    @property({ type: AudioSource, tooltip: 'Looping background music source' })
    bgmSource: AudioSource | null = null;

    @property({ type: AudioSource, tooltip: 'One-shot SFX source' })
    sfxSource: AudioSource | null = null;

    @property({ type: AudioClip, tooltip: 'Damage sound when player is hit' })
    damageClip: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: 'Fail sound when player loses all health' })
    failClip: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: 'Win sound when player reaches finish' })
    winClip: AudioClip | null = null;

    @property({ type: AudioClip, tooltip: 'Collect sound when a collectible is picked up' })
    collectClip: AudioClip | null = null;

    onLoad() {
        GameManager.events.on('state-changed', this.onStateChanged, this);
        GameManager.events.on('player-damaged', this.onPlayerDamaged, this);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
        GameManager.events.off('player-damaged', this.onPlayerDamaged, this);
    }

    private onStateChanged(next: GameState, _prev: GameState) {
        // Background music: play during core gameplay, stop on win/lose/download
        if (this.bgmSource) {
            switch (next) {
                case GameState.RUNNING:
                case GameState.TUTORIAL:
                case GameState.PLAYING:
                    if (!this.bgmSource.playing) {
                        this.bgmSource.play();
                    }
                    break;
                case GameState.WIN:
                case GameState.LOSE:
                case GameState.DOWNLOAD:
                    if (this.bgmSource.playing) {
                        this.bgmSource.stop();
                    }
                    break;
                default:
                    break;
            }
        }

        // Win / fail SFX
        switch (next) {
            case GameState.WIN:
                if (this.winClip) {
                    this.playSfx(this.winClip);
                }
                break;
            case GameState.LOSE:
                if (this.failClip) {
                    this.playSfx(this.failClip);
                }
                break;
            default:
                break;
        }
    }

    private onPlayerDamaged() {
        if (this.damageClip) {
            this.playSfx(this.damageClip);
        }
    }

    /** Called by point/collectible systems when a collectible is acquired */
    public playCollect() {
        if (this.collectClip) {
            this.playSfx(this.collectClip);
        }
    }

    private playSfx(clip: AudioClip) {
        if (this.sfxSource) {
            this.sfxSource.playOneShot(clip, 1);
        }
    }
}

