import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {ARTROOMS} from "../../config/constants";
import {notifier} from "../../notifier";
import {helper} from "../../helpers/helper";
export class ReserveMission extends Mission {

    reservers: Creep[];
    bulldozers: Creep[];
    controller: StructureController;

    memory: {
        wallCheck: boolean;
        needBulldozer: boolean;
    };

    constructor(operation: Operation) {
        super(operation, "claimer");
    }

    initMission() {
        if (!this.hasVision) return; //
        this.controller = this.room.controller;

        if (this.memory.needBulldozer === undefined) {
            this.memory.needBulldozer = this.checkBulldozer();
        }
    }

    roleCall() {
        let needReserver = !this.controller.my && (!this.controller.reservation ||
            this.controller.reservation.ticksToEnd < 3000);
        let maxReservers = needReserver ? 1 : 0;
        let potency = this.spawnGroup.room.controller.level === 8 ? 5 : 2;
        let reserverBody = () => this.configBody({
            claim: potency,
            move: potency
        });
        this.reservers = this.headCount("claimer", reserverBody, maxReservers);
        this.bulldozers = this.headCount("dozer", () => this.bodyRatio(4, 0, 1, 1), this.memory.needBulldozer ? 1 : 0);
    }

    missionActions() {
        for (let reserver of this.reservers) {
            this.reserverActions(reserver);
        }

        for (let dozer of this.bulldozers) {
            this.bulldozerActions(dozer);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }

    private reserverActions(reserver: Creep) {
        if (!this.controller) {
            reserver.blindMoveTo(this.flag);
            return; // early
        }

        if (reserver.pos.isNearTo(this.controller)) {
            reserver.reserveController(this.controller);
            if (!this.memory.wallCheck) {
                this.memory.wallCheck = this.destroyWalls(reserver, this.room)
            }
        }
        else {
            reserver.blindMoveTo(this.controller);
        }
    }

    private destroyWalls(surveyor: Creep, room: Room): boolean {
        if (!room.controller) return true;

        if (room.controller.my) {
            room.findStructures(STRUCTURE_WALL).forEach((w: Structure) => w.destroy());
            if (room.controller.level === 1) {
                room.controller.unclaim();
            }
            return true;
        }
        else {
            let roomAvailable = Game.gcl.level - _.filter(Game.rooms, (r: Room) => r.controller && r.controller.my).length;
            if (this.room.findStructures(STRUCTURE_WALL).length > 0 && !ARTROOMS[room.name] && roomAvailable > 0) {
                surveyor.claimController(room.controller);
                return false;
            }
            else {
                return true;
            }
        }
    }

    private checkBulldozer(): boolean {
        let ret = this.empire.findTravelPath(this.spawnGroup, this.room.controller);
        if (!ret.incomplete) {
            console.log(`RESERVER: No bulldozer necessary in ${this.opName}`);
            return false;
        }

        let ignoredStructures = this.empire.findTravelPath(this.spawnGroup, this.room.controller,
            {range: 1, ignoreStructures: true});
        if (ignoredStructures.incomplete) {
            notifier.add(`RESERVER: bad bulldozer path in ${this.opName}, please investigate.`);
            console.log(helper.debugPath(ret.path, this.opName));
            return false;
        }

        for (let position of ignoredStructures.path) {
            if (position.roomName !== this.room.name) { continue; }
            if (position.isPassible(true)) { continue; }
            if (position.lookForStructure(STRUCTURE_WALL) || position.lookForStructure(STRUCTURE_RAMPART))
            return true;
        }
    }

    private bulldozerActions(dozer: Creep) {

        if (dozer.pos.isNearTo(this.room.controller)) {
            this.memory.needBulldozer = false;
            console.log(`cleared path`);
            // notifier.add(`RESERVER: bulldozer cleared path in ${this.opName}`);
            // dozer.suicide();
        }
        else {
            if (dozer.room === this.room) {
                let outcome = this.empire.travelTo(dozer, this.room.controller, {
                    ignoreStructures: true,
                    ignoreStuck: true,
                    returnPosition: true,
                });

                if (outcome instanceof RoomPosition) {
                    let structure = outcome.lookFor<Structure>(LOOK_STRUCTURES)[0];
                    if (structure) {
                        dozer.dismantle(structure);
                    }
                }
            }
            else {
                this.empire.travelTo(dozer, this.room.controller);
            }
        }
    }
}