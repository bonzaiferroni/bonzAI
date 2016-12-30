import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {TRADE_PARTNERS, ALLIES, OBSERVER_PURPOSE_ALLYTRADE} from "../../config/constants";
import {helper} from "../../helpers/helper";
export class RadarMission extends Mission {

    memory: {
        fullScanComplete: boolean;
        scanIndex: number;
        fullScanData: {
            x: number;
            y: number;
        }
        tickLastScanned: number;
    };

    constructor(operation : Operation) {
        super(operation, "radar");
    }

    initMission() {
    }

    roleCall() {
    }

    missionActions() {
        let observer = this.findObserver();
        if (!observer) { return; }

        if (!this.memory.fullScanComplete) {
            this.fullScan(observer);
            return;
        }

        this.allyScan(observer);
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        if (Game.time > this.memory.tickLastScanned + 10000) {
            this.memory.fullScanComplete = false;
        }
    }

    private findObserver(): StructureObserver {
        let observer = this.room.findStructures(STRUCTURE_OBSERVER)[0] as StructureObserver;
        if (!observer) {
            if (this.room.controller.level === 8 && Game.time % 100 === 0) {
                console.log("NETWORK: please add an observer to", this.opName, "to participate in network");
            }
            return;
        }
        return observer;
    }

    private allyScan(observer: StructureObserver) {
        if (observer.observation && observer.observation.purpose === OBSERVER_PURPOSE_ALLYTRADE) {
            let room = observer.observation.room;
            if (!room.controller.owner || !TRADE_PARTNERS[room.controller.owner.username]) {
                this.empire.removeAllyRoom(room.name);
            }
        }

        this.memory.scanIndex = this.empire.observeAllyRoom(observer, this.memory.scanIndex)
    }

    private fullScan(observer: StructureObserver) {
        if (!this.memory.fullScanData) {
            console.log("NETWORK: Beginning full radar scan for", this.opName);
            this.memory.fullScanData = {
                x: -10,
                y: -10,
            };
        }

        let scanData = this.memory.fullScanData;

        if (observer.observation && observer.observation.purpose === "allySearch") {
            let room = observer.observation.room;

            if (room.controller) {
                if (room.controller.owner && !ALLIES[room.controller.owner.username]) {
                    console.log(`RADAR: ${this.opName} found hostile room at ${room.name}`);
                    this.empire.addHostileRoom(room.name, room.controller.level);
                }
                else {
                    this.empire.removeHostileRoom(room.name);
                    if (room.storage && room.terminal && room.controller.level >= 6 && !room.terminal.my &&
                        TRADE_PARTNERS[room.terminal.owner.username]) {
                        console.log(`RADAR: ${this.opName} found ally room at ${room.name}`);
                        this.empire.addAllyRoom(room.name);
                    }
                }
            }

            // increment
            scanData.x++;
            if (scanData.x > 10) {
                scanData.x = -10;
                scanData.y++;
                if (scanData.y > 10) {
                    this.memory.tickLastScanned = Game.time;
                    this.memory.fullScanComplete = true;
                    this.memory.fullScanData = undefined;
                    console.log(`NETWORK: Scan of ally rooms complete at ${this.opName}`);
                    return;
                }
            }
        }

        let roomName = helper.findRelativeRoomName(this.room, scanData.x, scanData.y);
        observer.observeRoom(roomName, "allySearch");
    }
}