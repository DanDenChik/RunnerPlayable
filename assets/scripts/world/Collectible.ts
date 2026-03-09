import { _decorator, Component, UITransform, Rect, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

export enum CollectibleType {
    DOLLAR,
    PAYPAL,
}

@ccclass('Collectible')
export class Collectible extends Component {

    type: CollectibleType = CollectibleType.DOLLAR;

    /** Set to true after collection to prevent re-triggering. */
    collected: boolean = false;

    /** True while the fly-to-score animation is playing (skip scrolling). */
    animating: boolean = false;

    private static _tmpPos = new Vec3();

    /** Return the point value for this collectible. */
    getPointValue(): number {
        if (this.type === CollectibleType.DOLLAR) {
            return 20;
        }
        // PayPal: random 10, 20, 30, or 40
        return (Math.floor(Math.random() * 4) + 1) * 10;
    }

    /** Return world-space AABB (anchorY = 0, anchorX = 0.5). */
    getWorldAABB(): Rect {
        const ut = this.node.getComponent(UITransform)!;
        this.node.getWorldPosition(Collectible._tmpPos);
        const w = ut.contentSize.width;
        const h = ut.contentSize.height;
        return new Rect(
            Collectible._tmpPos.x - w / 2,
            Collectible._tmpPos.y,
            w,
            h,
        );
    }
}
