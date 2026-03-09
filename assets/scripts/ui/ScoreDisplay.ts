import { _decorator, Component, Label, tween, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/** Displays player score. No adaptive sizing — uses editor-defined sizes.
 *  Just set up the Widget on the label in the editor to center it. */
@ccclass('ScoreDisplay')
export class ScoreDisplay extends Component {

    @property({ tooltip: 'Font size for score text' })
    designFontSize: number = 32;

    private _score: number = 0;
    private _label: Label | null = null;

    onLoad() {
        this._label = this.getComponent(Label) || this.getComponentInChildren(Label);
        this.setScore(this._score);
    }

    setScore(value: number) {
        this._score = value;
        if (this._label) {
            this._label.string = `${value}$`;
            const digits = String(Math.abs(value)).length;
            const fontSize = digits <= 1 ? 100 : digits === 2 ? 81 : digits === 3 ? 65 : 49;
            this._label.fontSize = fontSize;
            this._label.lineHeight = Math.round(fontSize * 1.2);
        }
    }

    addScore(delta: number) {
        this.setScore(this._score + delta);
        this.pulse();
    }

    /** Quick scale pulse 1 → 1.1 → 1 on the node */
    private pulse() {
        const n = this.node;
        tween(n)
            .to(0.1, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineOut' })
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'sineIn' })
            .start();
    }

    getScore(): number {
        return this._score;
    }
}
