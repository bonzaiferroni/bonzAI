import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {PowerFlagScan} from "../../interfaces";
import {helper} from "../../helpers/helper";
import {ALLIES} from "../../config/constants";

export class PowerMission extends Mission {

    clydes: Creep[];
    bonnies: Creep[];
    carts: Creep[];

    scanFlags: Flag[];
    observer: StructureObserver;

    currentFlag: Flag;
    bank: StructurePowerBank;

    memory: {
        avoidRooms: string[];
        currentBank: {
            flagName: string;
            roomName: string;
            assisting: boolean;
            finishing: boolean;
            distance: number;
        }

        flagScan: PowerFlagScan;

        removeFlags: boolean;
        flagPlacement: {
            pos: RoomPosition;
            distance: number;
        }

        observedRoom: string;
        scanFlagIndex: number;
    };

    constructor(operation: Operation) {
        super(operation, "power");
    }

    initMission() {

        this.observer = this.room.findStructures(STRUCTURE_OBSERVER)[0] as StructureObserver;

        if (this.memory.flagScan) {
            this.continueScan();
        }
        else {
            this.scanFlags = this.getFlagSet("_scan_", 30);
        }

        if (!this.memory.currentBank) return; // early
        this.currentFlag = Game.flags[this.memory.currentBank.flagName];
        if (!this.currentFlag.room) return; // early
        this.bank = this.currentFlag.room.findStructures(STRUCTURE_POWER_BANK)[0] as StructurePowerBank;
    }

    roleCall() {
        if (!this.memory.currentBank) return; // early

        let max = this.memory.currentBank.finishing || this.memory.currentBank.assisting ? 0 : 1;

        this.bonnies = this.headCount("bonnie", () => this.configBody({ move: 25, heal: 25}), max, {
            prespawn: this.memory.currentBank.distance,
            reservation: { spawns: 2, currentEnergy: 8000 }
        });

        this.clydes = this.headCount("clyde", () => this.configBody({ move: 20, attack: 20}), this.bonnies.length);


        if (!this.memory.currentBank.finishing || this.memory.currentBank.assisting) return; // early

        let unitsPerCart = 1;
        let maxCarts = 0;
        if (this.bank) {
            let unitsNeeded = Math.ceil(this.bank.power / 100);
            maxCarts = Math.ceil(unitsNeeded / 16);
            unitsPerCart = Math.ceil(unitsNeeded / maxCarts);
        }

        this.carts = this.headCount("powerCart", () => this.workerBody(0, unitsPerCart * 2, unitsPerCart), maxCarts);
    }

    missionActions() {
        if (this.memory.currentBank) {
            this.observer.observeRoom(this.memory.currentBank.roomName);

            for (let i = 0; i < 2; i++) {
                let clyde = this.clydes[i];
                if (clyde) {
                    if (!clyde.memory.myBonnieName) {
                        if (this.clydes.length === this.bonnies.length) {
                            clyde.memory.myBonnieName = this.bonnies[i].name;
                        }
                    }
                    else {
                        this.clydeActions(clyde);
                        this.checkForAlly(clyde);
                    }
                }
                let bonnie = this.bonnies[i];
                if (bonnie) {
                    if (!bonnie.memory.myClydeName) {
                        if (this.clydes.length === this.bonnies.length) {
                            bonnie.memory.myClydeName = this.clydes[i].name;
                        }
                    }
                    else {
                        this.bonnieActions(bonnie);
                    }
                }
            }

            if (this.carts) {
                let order = 0;
                for (let cart of this.carts) {
                    this.powerCartActions(cart, order);
                    order++;
                }
            }
        }
        else {
            this.scanForBanks();
        }
    }

    finalizeMission() {
        if (!this.memory.currentBank) return;
        this.checkFinishingPhase();
        this.checkCompletion();
    }

    invalidateMissionCache() {
    }

    placeScanFlags() {
        let observer = this.room.findStructures(STRUCTURE_OBSERVER)[0];
        if (!observer) return "ERROR: Can't scan for flags without an observer";

        this.scanFlags.forEach(f => f.remove());
        this.memory.removeFlags = true;
        this.memory.flagPlacement = undefined;
        let allyRoomNames = this.getAlleysInRange(5);
        this.memory.flagScan = {
            alleyRoomNames: allyRoomNames,
            alleyIndex: 0,
            flagIndex: 0,
            avoidRooms: [],
            matrices: {}
        } as PowerFlagScan;
    }

    getAlleysInRange(range: number) {

        let roomNames = [];

        for (let i = this.room.coords.x - range; i <= this.room.coords.x + range; i++) {
            for (let j = this.room.coords.y - range; j <= this.room.coords.y + range; j++) {
                let x = i;
                let xDir = this.room.coords.xDir;
                let y = j;
                let yDir = this.room.coords.yDir;
                if (x < 0) {
                    x = Math.abs(x) - 1;
                    xDir = helper.negaDirection(xDir);
                }
                if (y < 0) {
                    y = Math.abs(y) - 1;
                    yDir = helper.negaDirection(yDir);
                }
                if (x % 10 === 0 || y % 10 === 0) {
                    roomNames.push(xDir + x + yDir + y);
                }
            }
        }

        return roomNames;
    }

    private continueScan() {
        let scanCache = this.memory.flagScan;

        // remove all existing scanFlags before starting the process
        if (this.memory.removeFlags) {
            let flags = this.getFlagSet("_scan_", 30);
            if (flags.length === 0) {
                console.log("POWER: all current flags removed, initating scan");
                this.memory.removeFlags = undefined;
            }
            else {
                console.log("POWER: removing", flags.length, "flags");
                return; // early
            }
        }

        // place new flags
        if (this.memory.flagPlacement) {
            let remotePos = helper.deserializeRoomPosition(this.memory.flagPlacement.pos);
            let distance = this.memory.flagPlacement.distance;
            let room = Game.rooms[remotePos.roomName];
            if (!room) {
                console.log("POWER: cannot detect room for some reason, retrying");
                this.observer.observeRoom(remotePos.roomName);
                return; // early
            }
            let existingFlag = _.filter(room.find(FIND_FLAGS), (flag: Flag) => flag.name.indexOf("_scan_") >= 0)[0] as Flag;
            let placeNewFlag = true;
            if (existingFlag) {
                if (existingFlag.memory.distance > distance) {
                    console.log("POWER: removing flag with greater distance (" + distance + "):", existingFlag.name);
                    existingFlag.remove();
                }
                else {
                    placeNewFlag = false;
                    this.memory.flagPlacement = undefined;
                }
            }

            if (placeNewFlag) {
                let outcome = remotePos.createFlag(this.opName + "_scan_" + scanCache.flagIndex);
                if (_.isString(outcome)) {
                    Memory.flags[outcome] = { distance: this.memory.flagPlacement.distance };
                    console.log("POWER: flag placement successful:", outcome);
                    this.memory.flagPlacement = undefined;
                    scanCache.flagIndex++;
                }
            }

            scanCache.alleyIndex++;
        }

        if (scanCache.alleyIndex === scanCache.alleyRoomNames.length) {
            console.log("POWER: Scan proces complete, cleaning up memory and assigning rooms to avoid");
            this.memory.avoidRooms = scanCache.avoidRooms;
            this.memory.flagScan = undefined;
            return; // conclude process
        }

        let alleyName = scanCache.alleyRoomNames[scanCache.alleyIndex];
        if (_.includes(scanCache.avoidRooms, alleyName)) {
            scanCache.alleyIndex++;
            return; // avoidRooms pathing to rooms you've indicated as off limits in memory.avoidRooms
        }

        // engage pathfinding
        let remotePos = new RoomPosition(25, 25, alleyName);
        let ret = helper.findSightedPath(this.spawnGroup.pos, remotePos, 20, this.observer, scanCache);
        if (!ret) return; // pathfinding still in progress

        console.log("POWER: Pathing complete for", alleyName);
        if (ret.incomplete) {
            console.log("POWER: No valid path was found");
            scanCache.alleyIndex++;
            return; // early
        }

        if (ret.path.length > 250) {
            console.log("POWER: Path found but distance exceeded 250");
            scanCache.alleyIndex++;
            return; // early
        }

        console.log("POWER: Valid path found, initiating placement scan");
        this.memory.flagPlacement = {
            distance: ret.path.length,
            pos: remotePos,
        };
        this.observer.observeRoom(remotePos.roomName);
    }

    private scanForBanks() {
        if (!this.scanFlags || this.scanFlags.length === 0) return;

        if (this.memory.observedRoom) {
            let room = Game.rooms[this.memory.observedRoom];
            if (room) {
                let walls = room.findStructures(STRUCTURE_WALL);
                if (walls.length > 0) return;
                let powerBank = room.findStructures(STRUCTURE_POWER_BANK)[0] as StructurePowerBank;
                if (powerBank && powerBank.ticksToDecay > 4500 && powerBank.power > Memory.playerConfig.powerMinimum) {
                    console.log("\\o/ \\o/ \\o/", powerBank.power, "power found at", room, "\\o/ \\o/ \\o/");
                    this.memory.currentBank = {
                        flagName: this.scanFlags[this.memory.scanFlagIndex].name,
                        roomName: this.memory.observedRoom,
                        distance: this.scanFlags[this.memory.scanFlagIndex].memory.distance,
                        finishing: false,
                        assisting: undefined,
                    };
                    this.observer.observeRoom(room.name);
                    return;
                }
            }
        }
        if (Math.random() < .5) {
            this.memory.scanFlagIndex++;
            if (this.memory.scanFlagIndex >= this.scanFlags.length) this.memory.scanFlagIndex = 0;
            let flag = this.scanFlags[this.memory.scanFlagIndex];
            if (flag) {
                this.memory.observedRoom = flag.pos.roomName;
                this.observer.observeRoom(this.memory.observedRoom);
            }
            else {
                console.log("POWER: didn't find a flag in", this.opName, "(might be flag lag)");
            }
        }
        else {
            this.memory.observedRoom = undefined;
        }
    }

    private clydeActions(clyde: Creep) {

        let myBonnie = Game.creeps[clyde.memory.myBonnieName];
        if (!myBonnie || (!clyde.pos.isNearTo(myBonnie) && !clyde.isNearExit(1))) {
            clyde.idleOffRoad(this.flag);
            return;
        }

        if (!this.bank) {
            if (clyde.room.name === this.currentFlag.pos.roomName) {
                clyde.suicide();
                myBonnie.suicide();
            }
            else {
                clyde.blindMoveTo(this.currentFlag);
            }
            return;
        }

        if (clyde.pos.isNearTo(this.bank)) {
            clyde.memory.inPosition = true;
            if (this.bank.hits > 600 || clyde.ticksToLive < 5) {
                clyde.attack(this.bank);
            }
            else {
                for (let cart of this.carts) {
                    if (cart.room !== this.bank.room) {
                        return;
                    }
                }
                clyde.attack(this.bank);
            }
        }
        else if (myBonnie.fatigue === 0) {
            if (this.memory.currentBank.assisting === undefined) {
                // traveling from spawn
                clyde.blindMoveTo(this.bank, this.powerMoveOps);
            }
            else {
                clyde.moveTo(this.bank, {reusePath: 0});
            }
        }
    }

    private bonnieActions(bonnie: Creep) {
        let myClyde = Game.creeps[bonnie.memory.myClydeName];
        if (!myClyde) {
            return;
        }

        if (myClyde.ticksToLive === 1) {
            bonnie.suicide();
            return;
        }

        if (bonnie.pos.isNearTo(myClyde)) {
            if (myClyde.memory.inPosition) {
                bonnie.heal(myClyde);
            }
            else {
                bonnie.move(bonnie.pos.getDirectionTo(myClyde));
            }
        }
        else {
            bonnie.blindMoveTo(myClyde);
        }
    }

    private powerCartActions(cart: Creep, order: number) {
        if (!cart.carry.power) {
            if (cart.room.name !== this.currentFlag.pos.roomName) {
                if (this.bank) {
                    // traveling from spawn
                    cart.blindMoveTo(this.currentFlag, this.powerMoveOps);
                }
                else {
                    this.recycleCreep(cart);
                }
                return;
            }

            let power = cart.room.find(FIND_DROPPED_RESOURCES,
                { filter: (r: Resource) => r.resourceType === RESOURCE_POWER})[0] as Resource;
            if (power) {
                if (cart.pos.isNearTo(power)) {
                    cart.pickup(power);
                    cart.blindMoveTo(this.room.storage);
                }
                else {
                    cart.blindMoveTo(power);
                }
                return; //  early;
            }

            if (!this.bank) {
                this.recycleCreep(cart);
                return;
            }

            if (!cart.memory.inPosition) {
                if (this.bank.pos.openAdjacentSpots().length > 0) {
                    if (cart.pos.isNearTo(this.bank)) {
                        cart.memory.inPosition = true;
                    }
                    else {
                        cart.blindMoveTo(this.bank);
                    }
                }
                else if (order > 0) {
                    if (cart.pos.isNearTo(this.carts[order - 1])) {
                        cart.memory.inPosition = true;
                    }
                    else {
                        cart.blindMoveTo(this.carts[order - 1]);
                    }
                }
                else {
                    if (cart.pos.isNearTo(this.clydes[0])) {
                        cart.memory.inPosition = true;
                    }
                    else {
                        cart.blindMoveTo(this.clydes[0]);
                    }
                }
            }
            return; // early
        }

        if (cart.pos.isNearTo(this.room.storage)) {
            cart.transfer(this.room.storage, RESOURCE_POWER);
        }
        else {
            // traveling to storage
            cart.blindMoveTo(this.room.storage, this.powerMoveOps);
        }
    }

    private checkFinishingPhase() {
        if (!this.bank || this.clydes.length === 0 || this.memory.currentBank.finishing) return;
        let attackTicksNeeded = Math.ceil(this.bank.hits / 600);
        let clyde = _.last<Creep>(this.clydes);
        let ttlEstimate = clyde.memory.inPosition ? clyde.ticksToLive : 1000;
        if (ttlEstimate > attackTicksNeeded) {
            this.memory.currentBank.finishing = true;
        }
    }

    private checkCompletion() {
        if (this.memory.currentBank && Game.rooms[this.memory.currentBank.roomName] &&
            ((this.memory.currentBank.finishing && !this.bank && this.carts && this.carts.length === 0) ||
            (this.memory.currentBank.assisting && this.clydes && this.clydes.length === 0))) {
            this.memory.currentBank = undefined;
        }
    }

    private checkForAlly(clyde: Creep) {
        if (!this.bank || clyde.pos.roomName !== this.bank.pos.roomName || clyde.isNearExit(1) ||
            this.memory.currentBank.assisting !== undefined) return;

        let allyClyde = this.bank.room.find(FIND_HOSTILE_CREEPS, {
            filter: (c: Creep) => c.partCount(ATTACK) === 20 && ALLIES[c.owner.username] && !c.isNearExit(1)
        })[0] as Creep;

        if (!allyClyde) {
            return;
        }

        Memory["playEvent"] = { time: Game.time, roomName: this.bank.room.name };

        if (clyde.memory.play) {
            let myPlay = clyde.memory.play;
            let allyPlay = allyClyde.saying;
            if (!allyPlay || allyPlay === myPlay) {
                console.log("POWER: we had a tie!");
                clyde.say("tie!");
                clyde.memory.play = undefined;
            }
            else if ((allyPlay === "rock" && myPlay === "scissors") || (allyPlay === "scissors" && myPlay === "paper") ||
                (allyPlay === "paper" && myPlay === "rock")) {
                if (this.bank.pos.openAdjacentSpots(true).length === 1) {
                    let bonnie = Game.creeps[clyde.memory.myBonnieName];
                    bonnie.suicide();
                    clyde.suicide();
                }
                console.log("POWER: ally gets the power!");
                this.memory.currentBank.assisting = true;
                clyde.say("damn");
            }
            else {
                console.log("POWER: I get the power!");
                this.memory.currentBank.assisting = false;
                clyde.say("yay!");
            }
        }
        else {
            console.log("POWER: ally found in", clyde.room.name, "playing a game to find out who gets power");
            let random = Math.floor(Math.random() * 3);
            let play;
            if (random === 0) {
                play = "rock";
            }
            else if (random === 1) {
                play = "paper";
            }
            else if (random === 2) {
                play = "scissors";
            }
            clyde.memory.play = play;
            clyde.say(play);
        }
    }

    powerMoveOps = {
        costCallback: (roomName: string, matrix: CostMatrix) => {
            if (_.includes(this.memory.avoidRooms, roomName)) {
                return helper.blockOffExits(matrix);
            }
        }
    };
}