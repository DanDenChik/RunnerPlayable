import { _decorator, Component, tween, Vec3, sys } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('DownloadButton')
export class DownloadButton extends Component {

    @property({ tooltip: 'Store URL to open on click' })
    storeUrl: string = 'https://play.google.com/store/apps/details?id=ae.goragaming.playoff.blocks.game.make.earn.money.rewarded';

    private _originalScale: Vec3 = new Vec3(1, 1, 1);

    onLoad() {
        this._originalScale = this.node.scale.clone();
        this.startPulse();
    }

    private startPulse() {
        const big = new Vec3(
            this._originalScale.x * 1.1,
            this._originalScale.y * 1.1,
            this._originalScale.z,
        );

        tween(this.node)
            .to(0.5, { scale: big }, { easing: 'sineInOut' })
            .to(0.5, { scale: this._originalScale.clone() }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    onClickDownload() {
        sys.openURL(this.storeUrl);
    }
}
