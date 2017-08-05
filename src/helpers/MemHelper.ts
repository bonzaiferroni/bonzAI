export class MemHelper {

    /**
     * This is a memory-friendly type of position serialization, my tests showed that parsing performance was improved
     * by a factor of 10. Only appropriate when the room can be assumed
     * @param position
     * @returns {number}
     */

    public static intPosition (position: {x: number, y: number, roomName: string}): number {
        return position.x * 100 + position.y;
    };

    /**
     * Deserialize positions stored in memory as integers, must already know the roomName
     * @param serializedPos
     * @param roomName
     * @returns {RoomPosition}
     */

    public static deserializeIntPosition (serializedPos: number, roomName: string): RoomPosition {
        return new RoomPosition(Math.floor(serializedPos / 100), serializedPos % 100, roomName);
    };

    /**
     * Serialize array of positions to integer format (memory friendly)
     * @param positions
     */

    public static intPositions(positions: {x: number, y: number, roomName: string}[]): string {
        let ints = [];
        for (let position of positions) {
            ints.push(MemHelper.intPosition(position));
        }
        return ints.join("_");
    }

    public static deserializeIntPositions(serializedPositions: string, roomName: string): RoomPosition[] {
        let positions = [];
        let stringArray = serializedPositions.split("_");
        for (let str of stringArray) {
            positions.push(MemHelper.deserializeIntPosition(Number.parseInt(str, 10), roomName));
        }
        return positions;
    }

    public static posInstance(position: {x: number, y: number, roomName: string}): RoomPosition {
        return new RoomPosition(position.x, position.y, position.roomName);
    }

    public static posInstances(positions: {x: number, y: number, roomName: string}[]): RoomPosition[] {
        let instances = [];
        for (let position of positions) {
            instances.push(MemHelper.posInstance(position));
        }
        return instances;
    }

    /**
     * General purpose memorization of gameobjects, works with any host that has a memory property
     * @param host
     * @param identifier
     * @param find
     * @param validate
     * @param delay
     * @returns {any}
     */

    public static findObject<T extends {id: string}>(host: {memory: any}, identifier: string,
                                                     find: () => T, validate?: (obj: T) => boolean, delay?: number): T {
        if (host.memory[identifier]) {
            let obj = Game.getObjectById<T>(host.memory[identifier]);
            if (obj && (!validate || validate(obj))) {
                return obj;
            } else {
                delete host.memory[identifier];
                return MemHelper.findObject<T>(host, identifier, find, validate);
            }
        } else {
            if (Game.time < host.memory[`next_${identifier}`]) { return; }
            let obj = find();
            if (obj) {
                host.memory[identifier] = obj.id;
                delete host.memory[`next_${identifier}`];
                return obj;
            } else if (delay !== undefined) {
                host.memory[`next_${identifier}`] = Game.time + delay;
            }
        }
    }
}

export interface BonzaiMemory {
    strangerDanger: {[username: string]: StrangerReport[] };
    traders: {[username: string]: { [resourceType: string]: number; }};
    resourceOrder: {[time: number]: ResourceOrder};
    playerConfig: {

    };
    empire: any;
    profiler: {[identifier: string]: ProfilerData };
    notifier: {
        time: number,
        earthTime: string,
        message: string,
    }[];
    roomAttacks: any;
    powerObservers: {[scanningRoomName: string]: {[roomName: string]: number}};
    cpu: {
        history: number[];
        average: number;
    };
    rooms: {[roomName: string]: RoomMemory };
    hostileMemory: any;
    nextGC: number;
    gameTimeLastTick: number;
    viz: {[tick: number]: any };
    version: number;
}
