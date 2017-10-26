import {empire} from "../ai/Empire";
import {Traveler} from "../Traveler";
export interface FindClosestOptions {
    linearDistanceLimit?: number;
    opsLimit?: number;
    margin?: number;
    byRoute?: boolean;
}

export class RoomHelper {

    public static findClosest<T extends {pos: RoomPosition}>(
        origin: {pos: RoomPosition}, destinations: T[],
        options: FindClosestOptions = {}): {destination: T, distance: number}[] {

        if (options.linearDistanceLimit === undefined) {
            options.linearDistanceLimit = 16; // pathfinder room search limit
        }

        if (options.margin === undefined) {
            options.margin = 0;
        }

        let totalCPU = Game.cpu.getUsed();

        let filtered = _(destinations)
            .filter( dest => Game.map.getRoomLinearDistance(origin.pos.roomName,
                dest.pos.roomName) <= options.linearDistanceLimit)
            .sortBy( dest => Game.map.getRoomLinearDistance(origin.pos.roomName,
                dest.pos.roomName))
            .value();

        let bestDestinations: {destination: T, distance: number}[] = [];
        let bestLinearDistance = Number.MAX_VALUE;
        let bestDistance = Number.MAX_VALUE;
        for (let dest of filtered) {
            let linearDistance = Game.map.getRoomLinearDistance(origin.pos.roomName, dest.pos.roomName);
            if (linearDistance > bestLinearDistance) {
                continue;
            }

            let distance;
            let ret = Traveler.findTravelPath(origin.pos, dest.pos,
                {maxOps: options.opsLimit, ensurePath: true});
            if (ret.incomplete) {continue; }
            distance = ret.path.length;

            if (distance < bestDistance) {
                bestLinearDistance = linearDistance;
                bestDistance = distance;
                bestDestinations = _.filter(bestDestinations, value => value.distance <= bestDistance + options.margin);
            }

            if (distance <= bestDistance + options.margin) {
                bestDestinations.push({destination: dest, distance: distance});
            }
        }

        console.log(`FINDCLOSEST: cpu: ${Game.cpu.getUsed() - totalCPU}, # considered: ${destinations.length},` +
            ` # selected ${bestDestinations.length}`);

        return bestDestinations;
    }

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
            ints.push(RoomHelper.serializeIntPosition(position));
        }
        return ints.join("_");
    }

    public static deserializeIntPositions(serializedPositions: string, roomName: string): RoomPosition[] {
        let positions = [];
        let stringArray = serializedPositions.split("_");
        for (let str of stringArray) {
            positions.push(RoomHelper.deserializeIntPosition(Number.parseInt(str, 10), roomName));
        }
        return positions;
    }
}
