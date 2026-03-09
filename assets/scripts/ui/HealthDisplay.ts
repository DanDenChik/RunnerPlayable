import { _decorator, Component, Node, UIOpacity, UITransform, Label } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Manages 3 heart sprites.
 * Hearts whose index >= currentHealth get UIOpacity 0.3, the rest stay at 1.0.
 * No adaptive sizing — uses design values from the editor.
 */
@ccclass('HealthDisplay')
export class HealthDisplay extends Component {

    @property({ type: [Node], tooltip: 'Heart nodes (left to right, 3 total)' })
    hearts: Node[] = [];

    @property({ tooltip: 'Heart size' })
    designHeartSize: number = 40;

    @property({ tooltip: 'Spacing between hearts' })
    designSpacing: number = 8;

    private _maxHealth: number = 3;
    private _currentHealth: number = 3;

    get currentHealth(): number { return this._currentHealth; }

    onLoad() {
        for (const heart of this.hearts) {
            if (!heart) continue;
            if (!heart.getComponent(UIOpacity)) {
                heart.addComponent(UIOpacity);
            }
        }
        this.setHealth(this._maxHealth);
        this.layoutHearts();
    }

    /** Position and size hearts using design values */
    private layoutHearts() {
        const size = this.designHeartSize;
        const spacing = this.designSpacing;

        for (let i = 0; i < this.hearts.length; i++) {
            const heart = this.hearts[i];
            if (!heart) continue;
            const transform = heart.getComponent(UITransform);
            if (transform) {
                transform.setContentSize(size, size);
            }
            const label = heart.getComponent(Label);
            if (label) {
                label.fontSize = Math.round(size);
                label.lineHeight = Math.round(size);
            }
            heart.setPosition(i * (size + spacing), 0, 0);
        }
    }

    /** Update the visual state of hearts */
    setHealth(hp: number) {
        this._currentHealth = Math.max(0, Math.min(hp, this._maxHealth));

        for (let i = 0; i < this.hearts.length; i++) {
            const heart = this.hearts[i];
            if (!heart) continue;
            const opacity = heart.getComponent(UIOpacity);
            if (opacity) {
                opacity.opacity = i < this._currentHealth ? 255 : 76; // 76 ≈ 255 * 0.3
            }
        }
    }

    /** Lose one heart */
    damage() {
        this.setHealth(this._currentHealth - 1);
    }
}
