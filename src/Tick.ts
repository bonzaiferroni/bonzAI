import {Operation} from "./ai/operations/Operation";
export class Tick {

    public static cacheTick: number;
    public static cache: {
        structures: { [roomName: string]: {[structureType: string]: Structure[]} },
        hostiles: { [roomName: string]: Creep[] },
        hostilesAndLairs: { [roomName: string]: RoomObject[] }
        lairThreats: { [roomName: string]: StructureKeeperLair[] }
        fleeObjects: { [roomName: string]: RoomObject[] }
        mineralCount: { [mineralType: string]: number }
        labProcesses: { [resourceType: string]: number }
        activeLabCount: number;
        placedRoad: boolean;
        bypassCount: number;
        exceptionCount: number;
    };

    public static temp: any;
    public static operations: {[opName: string]: Operation };

    public static init() {
        this.refresh();
    }

    public static refresh() {
        if (Game.time === this.cacheTick) { return; }
        this.cacheTick = Game.time;
        this.temp = {};
        this.operations = {};
        this.cache = { structures: {}, hostiles: {}, hostilesAndLairs: {}, mineralCount: {}, labProcesses: {},
            activeLabCount: 0, placedRoad: false, fleeObjects: {}, lairThreats: {}, bypassCount: 0, exceptionCount: 0};
    }
}
