export class Mem {

    /**
     * This is a memory-friendly type of position serialization, my tests showed that parsing performance was improved
     * by a factor of 10. Only appropriate when the room can be assumed
     * @param position
     * @returns {number}
     */

    public static serializeIntPosition (position: {x: number, y: number, roomName: string}): number {
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

    public static serializeIntPositions(positions: {x: number, y: number, roomName: string}[]): string {
        let ints = [];
        for (let position of positions) {
            ints.push(Mem.serializeIntPosition(position));
        }
        return ints.join("_");
    }

    public static deserializeIntPositions(serializedPositions: string, roomName: string): RoomPosition[] {
        let positions = [];
        let stringArray = serializedPositions.split("_");
        for (let str of stringArray) {
            positions.push(Mem.deserializeIntPosition(Number.parseInt(str, 10), roomName));
        }
        return positions;
    }

    public static posInstance(position: {x: number, y: number, roomName: string}): RoomPosition {
        return new RoomPosition(position.x, position.y, position.roomName);
    }

    public static posInstances(positions: {x: number, y: number, roomName: string}[]): RoomPosition[] {
        let instances = [];
        for (let position of positions) {
            instances.push(Mem.posInstance(position));
        }
        return instances;
    }
}