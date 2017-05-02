import {empire} from "./Empire";
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
            let ret = empire.traveler.findTravelPath(origin, dest,
                {maxOps: options.opsLimit, useFindRoute: options.byRoute});
            if (ret.incomplete) { continue; }
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
}
