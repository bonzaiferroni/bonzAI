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

    public static colorPos(pos: RoomPosition, color: string, alpha = .2, maintain = false) {
        new RoomVisual(pos.roomName).rect(pos.x - .5, pos.y - .5, 1, 1, {fill: color, opacity: alpha});
        if (maintain) {
            arguments[3] = false;
            Viz.addMaintain({functionName: "colorPos", args: arguments});
        }
    }

    private static addMaintain(order: VizOrder) {
        if (!Memory.viz[Game.time]) { Memory.viz[Game.time] = []; }
        Memory.viz[Game.time].push(order);
    }

    public static maintain() {
        if (!Memory.viz) { Memory.viz = {}; }
        for (let tick in Memory.viz) {
            if (Game.time > Number.parseInt(tick) + 50) {
                delete Memory.viz[tick];
                continue;
            }
            let visuals = Memory.viz[tick];
            for (let visual of visuals) {
                Viz[visual.functionName](visual.args[0], visual.args[1], visual.args[2]);
            }
        }
    }
}

export interface VizOrder {
    functionName: string;
    args: IArguments;
}
