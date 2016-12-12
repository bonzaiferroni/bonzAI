import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {
    SUPPLY_SWAP_THRESHOLD, SUPPLY_ENERGY_THRESHOLD, NEED_ENERGY_THRESHOLD,
    RESERVE_AMOUNT, TRADE_RESOURCES, MINERALS_RAW,
    MINERAL_STORAGE_TARGET, KCLUBBERS, TRADE_MAX_DISTANCE, TRADE_ENERGY_AMOUNT,
} from "../../config/constants";
import {helper} from "../../helpers/helper";
export class TerminalNetworkMission extends Mission {

    terminal: StructureTerminal;
    storage: StructureStorage;
    traded: boolean;
    memory: {
        fortRoomNames: string[],
        swapRoomNames: string[],
        searchData: {
            x: number,
            y: number,
            forts: string[],
            swaps: string[]
        }
        scanData: {
            roomNames: string[],
            index: number
        }
        scanDelay: number
    };

    constructor(operation: Operation) {
        super(operation, "network");
    }

    initMission() {
        this.terminal = this.room.terminal;
        this.storage = this.room.storage;
    }

    roleCall() {
    }

    missionActions() {
        this.allyTrade();
        this.sellOverstock();
        this.checkOverstock();
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        this.memory.fortRoomNames = undefined;
        this.memory.swapRoomNames = undefined;
    }

    private energyNetworkActions() {
        if (this.terminal.store.energy < 30000 || Math.random() < .9) return;
        if (this.traded) return;

        this.supplyEnergyToForts();
        this.supplyEnergyToSwaps();
    }

    private mineralNetworkActions() {

        if (this.terminal.store.energy < 10000 || Math.random() < .9) return;
        if (!this.memory.fortRoomNames) return;
        if (this.traded) return;

        for (let resourceType of TRADE_RESOURCES) {
            if (this.empire.mineralTraded) break;
            let localAbundance = this.terminal.store[resourceType] >= RESERVE_AMOUNT * 2;
            if (!localAbundance) continue;
            let shortageFound = this.tradeResource(resourceType, this.memory.fortRoomNames);
            if (shortageFound) {
                return;
            }
        }
    }

    private tradeResource(resourceType: string, roomNames: string[]): boolean {

        let tradeWithAllies = this.empire.hasAbundance(resourceType, RESERVE_AMOUNT);

        for (let roomName of roomNames) {
            if (roomName === this.terminal.room.name) continue;
            let threshold = Math.max(RESERVE_AMOUNT - Game.map.getRoomLinearDistance(this.room.name, roomName, true) * 100, 1000);
            let otherRoom = Game.rooms[roomName];
            if (!otherRoom || !otherRoom.terminal || otherRoom.controller.level < 6
                || (!otherRoom.terminal.my && !tradeWithAllies)
                || otherRoom.terminal.store[resourceType] >= threshold) continue;
            let otherRoomAmount = otherRoom.terminal.store[resourceType] ? otherRoom.terminal.store[resourceType] : 0;
            let amount = Math.max(Math.min(threshold - otherRoomAmount, RESERVE_AMOUNT), 100);
            this.sendResource(resourceType, amount, otherRoom.terminal);
            return true;
        }
        return false;
    }

    private sellOverstock() {

        if (Game.time % 100 !== 1) return;

        for (let mineralType of MINERALS_RAW) {
            if (this.storage.store[mineralType] >= MINERAL_STORAGE_TARGET[mineralType]
                && this.storage.room.terminal.store[mineralType] >= RESERVE_AMOUNT) {
                console.log("TRADE: have too much", mineralType, "in", this.storage.room, this.storage.store[mineralType]);
                this.empire.sellExcess(this.room, mineralType, RESERVE_AMOUNT);
            }
        }

        if (_.sum(this.storage.store) >= 940000) {
            console.log("TRADE: have too much energy in", this.storage.room, this.storage.store.energy);
            this.empire.sellExcess(this.room, RESOURCE_ENERGY, RESERVE_AMOUNT);
        }
    }

    private allyTrade() {
        let observer = this.room.findStructures(STRUCTURE_OBSERVER)[0] as StructureObserver;
        if (!observer) {
            if (this.room.controller.level === 8 && Game.time % 100 === 0) {
                console.log("NETWORK: please add an observer to", this.opName, "to participate in network");
            }
            return;
        }

        if (!this.memory.scanData) {
            this.initScan(observer);
            return;
        }

        let scanData = this.memory.scanData;
        // no ally rooms in range
        if (scanData.roomNames.length === 0) return;

        // gather information for next tick
        if (scanData.index >= scanData.roomNames.length) scanData.index = 0;
        observer.observeRoom(scanData.roomNames[scanData.index++], "allyScan");
    }

    private initScan(observer: StructureObserver) {
        if (!this.memory.searchData) {
            console.log("NETWORK: Beginning ally scan for", this.opName);
            this.memory.searchData = {
                x: -10,
                y: -10,
                forts: [],
                swaps: [],
            };
        }

        let scanData = this.memory.searchData;

        if (observer.observation && observer.observation.purpose === "allySearch") {
            let room = observer.observation.room;
            if (room.storage && room.terminal && !room.terminal.my && _.includes(KCLUBBERS, room.terminal.owner.username)) {
                // check for swap mining
                let swapPosition = this.findSwapPosition(room);
                if (swapPosition) {
                    console.log("NETWORK: ally scan found", room.terminal.owner.username + "'s swap mine at", room.name);
                    scanData.swaps.push(room.name);
                }
                else if (room.controller.level >= 6) {
                    console.log("NETWORK: ally scan found", room.terminal.owner.username + "'s owned room at", room.name);
                    scanData.forts.push(room.name);
                }
            }

            // increment
            scanData.x++;
            if (scanData.x > 10) {
                scanData.x = -10;
                scanData.y++;
                if (scanData.y > 10) {
                    this.empire.addAllyForts(scanData.forts);
                    this.empire.addAllySwaps(scanData.swaps);
                    this.memory.scanData = {
                        roomNames: scanData.forts.concat(scanData.swaps),
                        index: 0,
                    };
                    this.memory.searchData = undefined;
                    console.log("NETWORK: Scan of ally rooms complete at", this.opName, "found", scanData.forts.length,
                        "forts and", scanData.swaps.length, "swaps");
                    return;
                }
            }
        }

        if (observer.currentPurpose === undefined) {
            let roomName = helper.findRelativeRoomName(this.room, scanData.x, scanData.y);
            observer.observeRoom(roomName, "allySearch");
        }
    }

    private findSwapPosition(room: Room): RoomPosition {
        if (!room.storage || !room.terminal) return;
        // check for spawns
        if (room.find(FIND_HOSTILE_SPAWNS).length > 0) return;
        // check for layout match
        if (room.terminal.pos.getRangeTo(room.storage) !== 2) return;
        let position = room.terminal.pos.getPositionAtDirection(room.terminal.pos.getDirectionTo(room.storage));
        if (position.isNearTo(room.terminal) && position.isNearTo(room.storage)
            && position.getDirectionTo(room.storage) % 2 === 0 && position.getDirectionTo(room.terminal) % 2 === 0) return position;
    }

    private sendResource(resourceType: string, amount: number, otherTerminal: StructureTerminal) {
        if (otherTerminal.room.controller.level === 0) {
            console.log("NETWORK: error,", this.opName, "tried to send to abandoned room:", otherTerminal.room.name);
            return;
        }

        let spaceAvailable = otherTerminal.storeCapacity - _.sum(otherTerminal.store);
        let overstocked = false;
        if (resourceType === RESOURCE_ENERGY) {
            overstocked = spaceAvailable < amount;
        }
        else {
            overstocked = spaceAvailable < 30000;
        }

        if (overstocked) {
            console.log("NETWORK: error,", this.opName, "tried to send to full terminal:", otherTerminal.room.name);
            if (otherTerminal.my && otherTerminal.store.energy >= 20000) {
                this.balanceCapacity(otherTerminal);
            }
            return;
        }

        let outcome = this.terminal.send(resourceType, amount, otherTerminal.room.name);
        if (outcome === OK) {
            let distance = Game.map.getRoomLinearDistance(otherTerminal.room.name, this.room.name, true);
            console.log("NETWORK:", this.room.name, "→",
                otherTerminal.room.name + ":", amount, resourceType, "(" + otherTerminal.owner.username.substring(0, 3) + ", dist: " + distance + ")");
            if (resourceType === RESOURCE_ENERGY) {
                this.empire.energyTraded = true;
            }
            else {
                this.empire.mineralTraded = true;
            }
            this.traded = true;
        }
        else {
            console.log("NETWORK: error sending resource in", this.opName + ", outcome:", outcome);
            console.log("arguments used:", resourceType, amount, otherTerminal.room.name);
        }
    }

    private supplyEnergyToForts() {
        if (this.empire.energyTraded || this.storage.store.energy < SUPPLY_ENERGY_THRESHOLD || !this.memory.fortRoomNames) return;

        let overloaded = _.sum(this.storage.store) > 940000;
        for (let roomName of this.memory.fortRoomNames) {
            let distance = Game.map.getRoomLinearDistance(roomName, this.room.name, true);
            if (!overloaded && distance > TRADE_MAX_DISTANCE) {
                break;
            }
            let otherRoom = Game.rooms[roomName];
            if (!otherRoom) continue;
            if (otherRoom.controller.level < 6) continue;
            if (!otherRoom.storage || otherRoom.storage.store.energy > NEED_ENERGY_THRESHOLD) continue;
            if (!otherRoom.terminal || otherRoom.terminal.store.energy > 50000) continue;

            this.sendResource(RESOURCE_ENERGY, TRADE_ENERGY_AMOUNT, otherRoom.terminal);
            break;
        }
    }

    private supplyEnergyToSwaps() {
        if (this.empire.energyTraded || this.storage.store.energy < SUPPLY_SWAP_THRESHOLD || !this.memory.swapRoomNames) return;

        let overloaded = _.sum(this.storage.store) > 940000;
        for (let roomName of this.memory.swapRoomNames) {
            let distance = Game.map.getRoomLinearDistance(roomName, this.room.name, true);
            if (!overloaded && distance > TRADE_MAX_DISTANCE) {
                break;
            }
            let otherRoom = Game.rooms[roomName];
            if (!otherRoom) continue;
            if (otherRoom.controller.level < 6 || !otherRoom.storage || !otherRoom.terminal) continue;
            if (otherRoom.terminal.store.energy > 50000) continue;

            this.sendResource(RESOURCE_ENERGY, TRADE_ENERGY_AMOUNT, otherRoom.terminal);
            break;
        }
    }

    private balanceCapacity(otherTerminal: StructureTerminal) {
        let mostStockedAmount = 0;
        let mostStockedResource: string;
        for (let resourceType in otherTerminal.store) {
            if (resourceType === RESOURCE_ENERGY) continue;
            if (otherTerminal.store[resourceType] < mostStockedAmount) continue;
            mostStockedAmount = otherTerminal.store[resourceType];
            mostStockedResource = resourceType;
        }

        let leastStockedTerminal = _.sortBy(this.empire.terminals, (t: StructureTerminal) => _.sum(t.store))[0];
        otherTerminal.send(mostStockedResource, RESERVE_AMOUNT, leastStockedTerminal.room.name);
        console.log("NETWORK: balancing terminal capacity, sending", RESERVE_AMOUNT, mostStockedResource,
            "from", otherTerminal.room.name, "to", leastStockedTerminal.room.name);
    }

    private checkOverstock() {
        if (Game.time % 100 !== 0 || _.sum(this.terminal.store) < 250000) return;
        this.balanceCapacity(this.terminal);
    }
}