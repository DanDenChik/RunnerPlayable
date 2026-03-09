import { _decorator, Component, Node, Label, LabelOutline, LabelShadow, UITransform, Sprite, Color, tween, Vec3, sys, UIOpacity, view, Vec2, SpriteFrame } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Stylised CTA button inspired by the CSS .footer-cta pattern.
 *
 * Builds the visual layers programmatically (shadow → body → highlight → label)
 * so no external sprite assets are needed — just attach this component to an
 * empty node and configure in the inspector.
 *
 * Supports two presets via `useRedTheme`:
 *  • Gold (default): #ffe44d → #ffb830 body, #E07800 border, #c06000 shadow
 *  • Red (fail):     #ff6b6b → #e63946 body, #b71c1c border, #8b0000 shadow
 */
@ccclass('CTAButton')
export class CTAButton extends Component {

    @property({ type: SpriteFrame, tooltip: 'White SpriteFrame for button backgrounds (assign a white image here)' })
    whiteSpriteFrame: SpriteFrame | null = null;

    @property({ tooltip: 'Label text displayed on the button' })
    labelText: string = 'DOWNLOAD';

    @property({ tooltip: 'Store URL to open on click' })
    storeUrl: string = 'https://play.google.com/store/apps/details?id=ae.goragaming.playoff.blocks.game.make.earn.money.rewarded';

    @property({ tooltip: 'Use red fail theme instead of gold' })
    useRedTheme: boolean = false;

    @property({ tooltip: 'Design width of the button' })
    designWidth: number = 260;

    @property({ tooltip: 'Design height of the button' })
    designHeight: number = 64;

    @property({ tooltip: 'Font size at design resolution' })
    designFontSize: number = 24;

    @property({ tooltip: 'Border radius (visual — 9-slice would need a sprite, this is decorative context only)' })
    borderRadius: number = 10;

    @property({ tooltip: 'Enable pulsing animation' })
    enablePulse: boolean = true;

    /* ─── internal refs ─── */
    private _label: Label | null = null;
    private _originalScale = new Vec3(1, 1, 1);

    /* ─── colour palettes ─── */
    private static readonly GOLD = {
        bodyTop:    new Color(255, 228, 77, 255),   // #ffe44d
        bodyMid:    new Color(255, 184, 48, 255),   // #ffb830
        bodyBot:    new Color(255, 149, 0, 255),    // #ff9500
        border:     new Color(224, 120, 0, 255),    // #E07800
        shadow:     new Color(192, 96, 0, 255),     // #c06000
        highlight:  new Color(255, 255, 255, 100),  // inset top glow
    };

    private static readonly RED = {
        bodyTop:    new Color(255, 107, 107, 255),  // #ff6b6b
        bodyMid:    new Color(240, 70, 70, 255),    // #f04646
        bodyBot:    new Color(230, 57, 70, 255),    // #e63946
        border:     new Color(183, 28, 28, 255),    // #b71c1c
        shadow:     new Color(139, 0, 0, 255),      // #8b0000
        highlight:  new Color(255, 255, 255, 80),
    };

    onLoad() {
        this.buildButton();
        this._originalScale = this.node.scale.clone();
        if (this.enablePulse) this.startPulse();
    }

    /* ─── build layers ─── */

    private buildButton() {
        const palette = this.useRedTheme ? CTAButton.RED : CTAButton.GOLD;
        const W = this.designWidth;
        const H = this.designHeight;

        // Ensure root has UITransform
        let rootUT = this.node.getComponent(UITransform);
        if (!rootUT) rootUT = this.node.addComponent(UITransform);
        rootUT.setContentSize(W, H);
        rootUT.anchorX = 0.5;
        rootUT.anchorY = 0.5;

        // 1. Drop shadow layer (offset down 4px)
        this.makeColorRect('Shadow', W, H, 0, -4, palette.shadow);

        // 2. Border layer (full size)
        this.makeColorRect('Border', W, H, 0, 0, palette.border);

        // 3. Body (inset by 3px for border effect)
        const inset = 3;
        this.makeColorRect('Body', W - inset * 2, H - inset * 2, 0, 0, palette.bodyMid);

        // 4. Top highlight (top half of body, semi-transparent white overlay)
        const hlH = (H - inset * 2) / 2;
        const hlNode = this.makeColorRect('Highlight', W - inset * 2, hlH, 0, hlH / 2, palette.bodyTop);
        // Add slight transparency
        let op = hlNode.getComponent(UIOpacity);
        if (!op) op = hlNode.addComponent(UIOpacity);
        op.opacity = 200;

        // 5. Label
        const labelNode = new Node('Label');
        labelNode.parent = this.node;
        labelNode.setPosition(0, 1, 0); // slight vertical nudge up from shadow

        const label = labelNode.addComponent(Label);
        label.string = this.labelText;
        label.fontSize = this.designFontSize;
        label.lineHeight = this.designFontSize + 4;
        label.color = Color.WHITE;
        label.isBold = true;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;

        const labelUT = labelNode.getComponent(UITransform)!;
        labelUT.setContentSize(W - 20, H);
        labelUT.anchorX = 0.5;
        labelUT.anchorY = 0.5;

        // Label outline (simulates text-shadow black stroke)
        const outline = labelNode.addComponent(LabelOutline);
        outline.color = new Color(0, 0, 0, 255);
        outline.width = 2;

        // Label drop shadow
        const shadow = labelNode.addComponent(LabelShadow);
        shadow.color = new Color(0, 0, 0, 180);
        shadow.offset = new Vec2(0, -2);
        shadow.blur = 3;

        this._label = label;
    }

    private makeColorRect(name: string, w: number, h: number, x: number, y: number, color: Color): Node {
        const node = new Node(name);
        node.parent = this.node;

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.color = color;
        // Use assigned white sprite frame if available
        if (this.whiteSpriteFrame) {
            sprite.spriteFrame = this.whiteSpriteFrame;
        }

        const ut = node.getComponent(UITransform)!;
        ut.setContentSize(w, h);
        ut.anchorX = 0.5;
        ut.anchorY = 0.5;

        node.setPosition(x, y, 0);
        return node;
    }

    /* ─── pulse animation ─── */

    private startPulse() {
        const big = new Vec3(
            this._originalScale.x * 1.08,
            this._originalScale.y * 1.08,
            this._originalScale.z,
        );
        tween(this.node)
            .to(0.5, { scale: big }, { easing: 'sineInOut' })
            .to(0.5, { scale: this._originalScale.clone() }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }

    /* ─── public API ─── */

    /** Update the button label at runtime */
    setText(text: string) {
        this.labelText = text;
        if (this._label) this._label.string = text;
    }

    /** Handle click — opens store URL */
    onClickCTA() {
        sys.openURL(this.storeUrl);
    }
}
