import {Mission} from "./Mission";
import {Coord} from "../../interfaces";
interface SeedSelection {
    seedType: string;
    origin: Coord;
    rotation: number;
    energyPerDistance: number;
};

export class SeedMission extends Mission {

    public memory: {
        seedRooms: {
            [roomName: string]: {
                foundSeeds: boolean
                seedScan: {
                    [seedType: string]: Coord[]
                }
                didWalkabout: boolean
                walkaboutProgress: {
                    roomsInRange: string[]
                    sourceData: {pos: RoomPosition, amount: number}[]
                }
                sourceData: {pos: RoomPosition, amount: number}[]
                seedSelectData: {
                    index: number
                    rotation: number
                    best: SeedSelection
                }
                seedSelection: SeedSelection
            }
        }
    };

    constructor(operation) {
        super(operation, "seed");
    }

    public initMission() {
        for (let roomName in this.memory.seedRooms) {

        }
    }

    public roleCall() {
    }

    public missionActions() {
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

}
