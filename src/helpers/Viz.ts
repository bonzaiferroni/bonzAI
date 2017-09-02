export class Viz {

    public static showPath(path: RoomPosition[], color: string, maintain = false) {
        let lastPos: RoomPosition;
        for (let pos of path) {
            if (lastPos) {
                new RoomVisual(pos.roomName)
                    .line(lastPos, pos, {color: color, lineStyle: "dotted"});
            }
            lastPos = pos;
        }
    }

    public static colorPos(pos: RoomPosition, color = "cyan", opacity = .5) {
        new RoomVisual(pos.roomName).rect(pos.x - .5, pos.y - .5, 1, 1, {fill: color, opacity: opacity});
    }

    public static text(x: number, y: number, roomName: string, text: string, color = "white", font = "bold .3") {
        new RoomVisual(roomName).text(text, x, y, {color: color, font: font});
    }

    public static textPos(pos: RoomPosition, text: string, color = "white", font = "bold .3") {
        this.text(pos.x, pos.y, pos.roomName, text, color, font);
    }

    public static animatedPos(pos: RoomPosition, color = "cyan", opacity = .5, radius = .5, frames = 6) {
        frames = Math.max(frames, 1);

        let angle = (Game.time % frames * 90 / frames) * (Math.PI / 180);
        let s = Math.sin(angle);
        let c = Math.cos(angle);

        let modifier = Math.abs(Game.time % frames - frames / 2) / frames;
        radius += radius * modifier;
        let strokeWidth = .1 * (1 - modifier);

        let rotate = (x: number, y: number): {x: number,  y: number} => {
            let xDelta = x * c - y * s;
            let yDelta = x * s + y * c;
            return { x: pos.x + xDelta, y: pos.y + yDelta };
        };

        let points = [
            rotate(0, -radius),
            rotate(radius, 0),
            rotate(0, radius),
            rotate(-radius, 0),
            rotate(0, -radius),
        ];

        new RoomVisual(pos.roomName).poly(points, {stroke: color, opacity: opacity, strokeWidth: strokeWidth});
    }
}

export interface VizOrder {
    functionName: string;
    args: IArguments;
}
