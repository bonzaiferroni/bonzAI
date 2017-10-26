import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {Notifier} from "../../notifier";
import {helper} from "../../helpers/helper";
import {ARTROOMS} from "../WorldMap";
import {Agent} from "../agents/Agent";
import {Traveler} from "../../Traveler/Traveler";

interface ReserveMemory extends MissionMemory {
    wallCheck: boolean;
    needBulldozer: boolean;
    hardPath: boolean;
}

export class ReserveMission extends Mission {

    private reservers: Agent[];
    private bulldozers: Agent[];
    private controller: StructureController;

    public memory: ReserveMemory;

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    public static Add(operation: Operation) {
        if (!operation.room || !operation.room.controller) { return; }
        operation.addMission(new ReserveMission(operation));
    }

    public init() {
    }

    public update() {
        if (!this.state.hasVision) { return; }
        this.controller = this.room.controller;
        if (this.memory.needBulldozer === undefined) {
            this.memory.needBulldozer = this.checkBulldozer();
        }
    }

    private maxReservers = () => {
        let noNeed = this.controller.my || (this.controller.reservation && this.controller.reservation.ticksToEnd > 3000);
        if (noNeed) { return 0; }
        if (this.spawnGroup.maxSpawnEnergy < 650) {
            return 0;
        }
        if (this.spawnGroup.maxSpawnEnergy < 1300) {
            return 2;
        }
        return 1;
    };

    private reserverBody = (): string[] => {
        if (this.spawnGroup.maxSpawnEnergy < 1300) {
            return this.configBody({ claim: 1, move: 1 });
        }
        let potency = this.spawnGroup.room.controller.level === 8 ? 5 : 2;
        let claimCount = potency;
        let moveCount = claimCount;
        if (potency > 2 && this.memory.hardPath) {
            moveCount = claimCount * 5;
        }
        return this.configBody({ claim: claimCount, move: moveCount });
    };

    public roleCall() {
        this.reservers = this.headCount("claimer", this.reserverBody, this.maxReservers);
        this.bulldozers = this.headCount("dozer", () => this.workerUnitBody(4, 0, 1),
            () => this.memory.needBulldozer ? 1 : 0);
    }

    public actions() {
        for (let reserver of this.reservers) {
            this.reserverActions(reserver);
        }

        for (let dozer of this.bulldozers) {
            this.bulldozerActions(dozer);
        }
    }

    public finalize() {
    }

    public invalidateCache() {
        if (Math.random() < .1) { this.memory.hardPath = undefined; }
    }

    private reserverActions(reserver: Agent) {

        let fleeing = reserver.fleeHostiles();
        if (fleeing) { return; }

        if (!this.controller) {
            reserver.travelTo(this.flag);
            return; // early
        }

        if (reserver.pos.isNearTo(this.controller)) {
            if (reserver.memory.fatigued >= 5) {
                this.memory.hardPath = true;
            }
            reserver.reserveController(this.controller);
            if (!this.memory.wallCheck) {
                this.memory.wallCheck = this.destroyWalls(reserver, this.room);
            }
        } else {
            if (!reserver.memory.fatigued === undefined) {
                reserver.memory.fatigued = 0;
            }
            if (reserver.fatigue > 0) {
                reserver.memory.fatigued++;
            }
            reserver.travelTo(this.controller);
        }
    }

    private destroyWalls(surveyor: Agent, room: Room): boolean {
        if (!room.controller) { return true; }

        if (room.controller.my) {
            room.findStructures(STRUCTURE_WALL).forEach((w: Structure) => w.destroy());
            if (room.controller.level === 1) {
                room.controller.unclaim();
            }
            return true;
        } else {
            let roomAvailable = Game.gcl.level - _.filter(Game.rooms,
                    (r: Room) => r.controller && r.controller.my).length;
            if (this.room.findStructures(STRUCTURE_WALL).length > 0 && !ARTROOMS[room.name] && roomAvailable > 0) {
                surveyor.claimController(room.controller);
                return false;
            } else {
                return true;
            }
        }
    }

    private checkBulldozer(): boolean {
        let ret = Traveler.findTravelPath(this.spawnGroup.pos, this.room.controller.pos);
        if (!ret.incomplete) {
            console.log(`RESERVER: No bulldozer necessary in ${this.operation.name}`);
            return false;
        }

        let ignoredStructures = Traveler.findTravelPath(this.spawnGroup.pos, this.room.controller.pos,
            {range: 1, ignoreStructures: true});
        if (ignoredStructures.incomplete) {
            Notifier.log(`RESERVER: bad bulldozer path in ${this.operation.name}, please investigate.`);
            console.log(helper.debugPath(ret.path, this.operation.name));
            return false;
        }

        for (let position of ignoredStructures.path) {
            if (position.roomName !== this.room.name) { continue; }
            if (position.isPassible(true)) { continue; }
            if (position.lookForStructure(STRUCTURE_WALL) || position.lookForStructure(STRUCTURE_RAMPART)) {
                return true;
            }
        }
    }

    private bulldozerActions(dozer: Agent) {

        if (dozer.pos.isNearTo(this.room.controller)) {
            this.memory.needBulldozer = false;
            Notifier.log(`RESERVER: bulldozer cleared path in ${this.operation.name}`);
            dozer.suicide();
        } else {
            if (dozer.room === this.room) {
                let returnData: {nextPos: RoomPosition} = {nextPos: undefined};
                dozer.travelTo(this.room.controller, {
                    ignoreStructures: true,
                    stuckValue: 1500,
                    returnData: returnData,
                });

                if (returnData.nextPos) {
                    let structure = returnData.nextPos.lookFor<Structure>(LOOK_STRUCTURES)[0];
                    if (structure) {
                        dozer.dismantle(structure);
                    }
                }
            } else {
                dozer.travelTo(this.room.controller);
            }
        }
    }
}
