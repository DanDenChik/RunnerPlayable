import { _decorator, Component, Node } from 'cc';
import { GameManager } from '../game/GameManager';
import { GameState } from '../game/GameState';

const { ccclass, property } = _decorator;

/** Stub: will manage Win / Lose / Download overlay screens */
@ccclass('OverlayManager')
export class OverlayManager extends Component {

    @property({ type: Node, tooltip: 'Win screen root node' })
    winScreen: Node | null = null;

    @property({ type: Node, tooltip: 'Lose screen root node' })
    loseScreen: Node | null = null;

    @property({ type: Node, tooltip: 'Download screen root node' })
    downloadScreen: Node | null = null;

    onLoad() {
        this.hideAll();
        GameManager.events.on('state-changed', this.onStateChanged, this);
    }

    onDestroy() {
        GameManager.events.off('state-changed', this.onStateChanged, this);
    }

    private onStateChanged(next: GameState) {
        this.hideAll();
        switch (next) {
            case GameState.WIN:
                if (this.winScreen) this.winScreen.active = true;
                break;
            case GameState.LOSE:
                if (this.loseScreen) this.loseScreen.active = true;
                break;
            case GameState.DOWNLOAD:
                if (this.downloadScreen) this.downloadScreen.active = true;
                break;
        }
    }

    private hideAll() {
        if (this.winScreen) this.winScreen.active = false;
        if (this.loseScreen) this.loseScreen.active = false;
        if (this.downloadScreen) this.downloadScreen.active = false;
    }
}
