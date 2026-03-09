import { _decorator, Component, UITransform, Rect, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

export enum ObstacleType {
    MOVABLE,
    NON_MOVABLE,
}

@ccclass('Obstacle')
export class Obstacle extends Component {

    type: ObstacleType = ObstacleType.NON_MOVABLE;

    /** Extra speed towards the player (px/s). 0 for non-movable. */
    ownSpeed: number = 0;

    /** Set to true after first collision with the player to prevent re-triggering. */
    hit: boolean = false;

    private static _tmpPos = new Vec3();

    /** Return world-space AABB (anchorY = 0, anchorX = 0.5). */
    getWorldAABB(): Rect {
        const ut = this.node.getComponent(UITransform)!;
        this.node.getWorldPosition(Obstacle._tmpPos);
        const w = ut.contentSize.width;
        const h = ut.contentSize.height;
        // anchorX=0.5  →  left = worldX - w/2
        // anchorY=0    →  bottom = worldY
        return new Rect(
            Obstacle._tmpPos.x - w / 2,
            Obstacle._tmpPos.y,
            w,
            h,
        );
    }
}
