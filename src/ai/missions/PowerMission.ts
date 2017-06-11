import {Mission, MissionMemory} from "./Mission";
import {Operation} from "../operations/Operation";
import {BankData} from "../../interfaces";
import {helper} from "../../helpers/helper";
import {Notifier} from "../../notifier";
import {WorldMap} from "../WorldMap";
import {Agent} from "../agents/Agent";
import {empire} from "../Empire";
import {Traveler, TravelToOptions} from "../Traveler";

interface PowerMemory extends MissionMemory {
    disabled: boolean;
    currentBank: BankData;
    scanIndex: number;
    scanData: {[roomName: string]: number};
    nextClyde: number;
}

export class PowerMission extends Mission {

    private clydes: Agent[];
    private bonnies: Agent[];
    private carts: Agent[];

    public memory: PowerMemory;

    constructor(operation: Operation) {
        super(operation, "power");
    }

    public init() {
        if (this.memory.disabled) {
            this.operation.removeMission(this);
        }
    }

    public update() {
        let observer = this.room.findStructures(STRUCTURE_OBSERVER)[0] as StructureObserver;
        if (!observer) { return; }

        if (!Memory.powerObservers[this.room.name]) {
            Memory.powerObservers[this.room.name] = this.generateScanData();
            return;
        }

        if (this.memory.currentBank) {
            this.monitorBank(this.memory.currentBank);
        } else {
            this.scanForBanks(observer);
        }
    }

    public getMaxWaves() {
        if (!this.memory.currentBank) { return 0; }
        return Math.min(this.memory.currentBank.wavesLeft, this.memory.currentBank.posCount);
    }

    public getMaxBonnies = () => {
        if (!this.memory.currentBank || this.memory.currentBank.finishing || this.memory.currentBank.finishing) {
            return 0;
        }
        if (this.roleCount("bonnie") > this.roleCount("clyde")) {
            return 0;
        }
        if (this.spawnGroup.averageAvailability < .5) {
            return 1;
        }
        return this.getMaxWaves();
    };

    public getMaxClydes = () => {
        return Math.min(this.roleCount("bonnie"), this.getMaxWaves());
    };

    public roleCall() {
        let distance;
        if (this.memory.currentBank) {
            distance = this.memory.currentBank.distance;
        }

        this.bonnies = this.headCount("bonnie", () => this.configBody({ move: 25, heal: 25}),
            this.getMaxBonnies, {
            prespawn: distance,
            reservation: { spawns: 2, currentEnergy: 8000 },
        });

        if (this.spawnedThisTick("bonnie")) {
            this.memory.nextClyde = Game.time + 30;
        }

        if (Game.time < this.memory.nextClyde) {
            this.spawnGroup.isAvailable = false;
        }

        this.clydes = this.headCount("clyde", () => this.configBody({ move: 20, attack: 20}), this.getMaxClydes, {
                prespawn: distance,
            });

        if (this.spawnedThisTick("clyde")) {
            console.log(`spawned another power team ${this.room.name}`);
            this.memory.currentBank.wavesLeft--;
        }

        let unitsPerCart = 1;
        let maxCarts = 0;
        if (this.memory.currentBank && this.memory.currentBank.finishing && !this.memory.currentBank.assisting) {
            let unitsNeeded = Math.ceil(this.memory.currentBank.power / 100);
            maxCarts = Math.ceil(unitsNeeded / 16);
            unitsPerCart = Math.ceil(unitsNeeded / maxCarts);
        }

        this.carts = this.headCount("powerCart", () => this.workerBody(0, unitsPerCart * 2, unitsPerCart),
            () => maxCarts);
    }

    public actions() {

        for (let clyde of this.clydes) {
            this.clydeActions(clyde);
            this.checkForAlly(clyde);
        }

        for (let bonnie of this.bonnies) {
            this.bonnieActions(bonnie);
        }

        if (this.carts) {
            let order = 0;
            for (let cart of this.carts) {
                this.powerCartActions(cart, order);
                order++;
            }
        }
    }

    public finalize() {
    }

    public invalidateCache() {
    }

    private findAlleysInRange(range: number) {

        let roomNames = [];

        for (let i = this.room.coords.x - range; i <= this.room.coords.x + range; i++) {
            for (let j = this.room.coords.y - range; j <= this.room.coords.y + range; j++) {
                let x = i;
                let xDir = this.room.coords.xDir;
                let y = j;
                let yDir = this.room.coords.yDir;
                if (x < 0) {
                    x = Math.abs(x) - 1;
                    xDir = WorldMap.negaDirection(xDir);
                }
                if (y < 0) {
                    y = Math.abs(y) - 1;
                    yDir = WorldMap.negaDirection(yDir);
                }
                let roomName = xDir + x + yDir + y;
                if ((x % 10 === 0 || y % 10 === 0) && Game.map.isRoomAvailable(roomName)) {
                    roomNames.push(roomName);
                }
            }
        }

        return roomNames;
    }

    private clydeActions(clyde: Agent) {

        let bonnie = this.findPartner(clyde, this.bonnies);
        if (!bonnie && clyde.ticksToLive < 500) {
            clyde.suicide();
            return;
        }
        if (!bonnie || (!clyde.pos.isNearTo(bonnie) && !clyde.pos.isNearExit(1))) {
            clyde.idleOffRoad(this.flag);
            return;
        }

        if (!this.memory.currentBank) {
            console.log(`POWER: clyde checking out: ${clyde.room.name}`);
            clyde.suicide();
            bonnie.suicide();
            return;
        }

        let bankPos = helper.deserializeRoomPosition(this.memory.currentBank.pos);

        if (clyde.pos.roomName === bankPos.roomName) {
            let powerStruggle = this.powerStruggle(clyde, bonnie, bankPos);
            if (powerStruggle) { return; }
        }

        if (clyde.pos.isNearTo(bankPos)) {
            clyde.memory.inPosition = true;
            let bank = bankPos.lookForStructure(STRUCTURE_POWER_BANK);
            if (bank) {
                if (bank.hits > 600 || clyde.ticksToLive < 5) {
                    clyde.attack(bank);
                } else {
                    // wait for carts
                    for (let cart of this.carts) {
                        if (!bankPos.inRangeTo(cart, 10)) {
                            return;
                        }
                    }
                    clyde.attack(bank);
                }
            }
        } else if (bonnie.fatigue === 0) {
            if (this.memory.currentBank.assisting === undefined) {
                // traveling from spawn
                clyde.travelTo({pos: bankPos}, {ignoreRoads: true});
            } else {
                clyde.travelTo({pos: bankPos}, {ignoreCreeps: false});
            }
        }
    }

    private bonnieActions(bonnie: Agent) {
        let clyde = this.findPartner(bonnie, this.clydes);
        if (!clyde) {
            bonnie.idleOffRoad();
            if (bonnie.ticksToLive < 500) {
                bonnie.suicide();
            }
            return;
        }

        if (clyde.ticksToLive === 1) {
            bonnie.suicide();
            return;
        }

        if (bonnie.pos.isNearTo(clyde)) {
            if (clyde.memory.inPosition) {
                bonnie.heal(clyde);
            } else {
                bonnie.move(bonnie.pos.getDirectionTo(clyde));
            }
        } else {
            bonnie.travelTo(clyde);
        }
    }

    private powerStruggle(clyde: Agent, bonnie: Agent, bankPos: RoomPosition) {
        let hostiles = bankPos.findInRange(clyde.room.hostiles, 10);
        if (hostiles.length === 0) {
            return false;
        }
        if (Game.time % 4 === 0 ) { console.log(`POWER: power struggle in ${clyde.pos.roomName} /o/  \\o\\`); }

        // healing
        let outcome;
        if (clyde.hits < clyde.hitsMax) {
            if (bonnie.pos.isNearTo(clyde)) {
                outcome = bonnie.heal(clyde);
            } else {
                outcome = bonnie.rangedHeal(clyde);
            }
        }
        if (outcome !== OK && bonnie.hits < bonnie.hitsMax) {
            bonnie.heal(bonnie);
        }

        // targeting
        let targets = _.filter(hostiles, x => x.partCount(HEAL) > 0);
        if (targets.length === 0) {
            targets = _.filter(hostiles, x => x.partCount(ATTACK) > 0);
        }
        if (targets.length === 0) {
            targets = hostiles;
        }

        let target = clyde.pos.findClosestByRange(targets);
        if (!target) {
            return false;
        }

        // attack and move
        Agent.squadTravel(clyde, bonnie, target);
        clyde.attack(target);
        return true;
    }

    private powerCartActions(cart: Agent, order: number) {

        let options: TravelToOptions = {
            preferHighway: true,
        };

        if (!cart.carry.power) {
            if (this.memory.currentBank && this.memory.currentBank.finishing) {
                let bankPos = helper.deserializeRoomPosition(this.memory.currentBank.pos);

                if (cart.pos.roomName !== bankPos.roomName || cart.pos.isNearExit(1)) {
                    options.ignoreRoads = true;
                    cart.travelTo(bankPos, options);
                } else {
                    this.approachBank(cart, bankPos, order);
                }

                return;
            } else {
                let power = cart.room.find(FIND_DROPPED_RESOURCES,
                    { filter: (r: Resource) => r.resourceType === RESOURCE_POWER})[0] as Resource;
                if (power) {
                    if (cart.pos.isNearTo(power)) {
                        cart.pickup(power);
                        cart.travelTo(this.room.storage);
                    } else {
                        cart.travelTo(power);
                    }
                    return; //  early;
                }
            }

            this.recycleAgent(cart);
            return; // early
        }

        if (cart.pos.isNearTo(this.room.storage)) {
            cart.transfer(this.room.storage, RESOURCE_POWER);
        } else {
            // traveling to storage
            cart.travelTo(this.room.storage, options);
        }
    }

    private approachBank(cart: Agent, bankPos: RoomPosition, order: number) {

        if (cart.memory.inPosition) {
            cart.memory.inPosition = Game.time % 25 !== 0;
        } else {
            if (bankPos.openAdjacentSpots().length > 0) {
                if (cart.pos.isNearTo(bankPos)) {
                    cart.memory.inPosition = true;
                } else {
                    cart.travelTo({pos: bankPos} );
                }
            } else if (order > 0) {
                let lastCart = this.carts[order - 1];
                if (cart.pos.isNearTo(lastCart)) {
                    cart.memory.inPosition = true;
                } else {
                    cart.travelTo(lastCart );
                }
            } else {
                if (cart.pos.isNearTo(this.clydes[0])) {
                    cart.memory.inPosition = true;
                } else {
                    cart.travelTo(this.clydes[0] );
                }
            }
        }
    }

    private checkForAlly(clyde: Agent) {
        if (clyde.pos.isNearExit(1) || !this.memory.currentBank || this.memory.currentBank.assisting !== undefined) {
            return;
        }

        let bank = clyde.room.findStructures<StructurePowerBank>(STRUCTURE_POWER_BANK)[0];
        if (!bank) { return; }

        let allyClyde = bank.room.find(FIND_HOSTILE_CREEPS, {
            filter: (c: Creep) => c.partCount(ATTACK) === 20 && empire.diplomat.allies[c.owner.username] &&
            !c.pos.isNearExit(1),
        })[0] as Creep;

        if (!allyClyde) {
            return;
        }

        if (clyde.memory.play) {
            let myPlay = clyde.memory.play;
            let allyPlay = allyClyde.saying;
            if (!allyPlay || allyPlay === myPlay) {
                console.log("POWER: we had a tie!");
                clyde.say("tie!", true);
                clyde.memory.play = undefined;
            } else if ((allyPlay === "rock" && myPlay === "scissors") ||
                (allyPlay === "scissors" && myPlay === "paper") ||
                (allyPlay === "paper" && myPlay === "rock")) {
                if (bank.pos.openAdjacentSpots(true).length === 1) {
                    let bonnie = Game.creeps[clyde.memory.myBonnieName];
                    bonnie.suicide();
                    clyde.suicide();
                }
                this.memory.currentBank.assisting = true;
                clyde.say("damn", true);
                Notifier.log(`"POWER: ally gets the power! ${bank.room.name}`);
            } else {
                this.memory.currentBank.assisting = false;
                clyde.say("yay!", true);
                Notifier.log(`"POWER: I get the power! ${bank.room.name}`);
            }
        } else {
            console.log("POWER: ally found in", clyde.room.name, "playing a game to find out who gets power");
            let random = Math.floor(Math.random() * 3);
            let play;
            if (random === 0) {
                play = "rock";
            } else if (random === 1) {
                play = "paper";
            } else if (random === 2) {
                play = "scissors";
            }
            clyde.memory.play = play;
            clyde.say(play, true);
        }
    }

    private generateScanData(): {[roomName: string]: number} {
        if (Game.cpu.bucket < 10000) { return; }

        let scanData: {[roomName: string]: number} = {};
        let spawn = this.spawnGroup.spawns[0];
        let possibleRoomNames = this.findAlleysInRange(5);
        for (let roomName of possibleRoomNames) {
            let position = helper.pathablePosition(roomName);
            let ret = Traveler.findTravelPath(spawn.pos, position);
            if (ret.incomplete) {
                Notifier.log(`POWER: incomplete path generating scanData (${this.operation.name}, room: ${roomName})`);
                continue;
            }

            let currentObserver = _.find(Memory.powerObservers, (value) => value[roomName]);
            let distance = ret.path.length;
            if (distance > 250) { continue; }

            if (currentObserver) {
                if (currentObserver[roomName] > distance) {
                    console.log(`POWER: found better distance for ${roomName} at ${this.operation.name}, ` +
                        `${currentObserver[roomName]} => ${distance}`);
                    delete currentObserver[roomName];
                } else {
                    continue;
                }
            }

            scanData[roomName] = distance;
        }

        console.log(`POWER: found ${Object.keys(scanData).length} rooms for power scan in ${this.operation.name}`);
        return scanData;
    }

    private monitorBank(currentBank: BankData) {
        let room = Game.rooms[currentBank.pos.roomName];
        if (room) {
            let bank = room.findStructures<StructurePowerBank>(STRUCTURE_POWER_BANK)[0];
            if (!bank) {
                this.memory.currentBank = undefined;
                return;
            }

            if (!currentBank.finishing && Math.random() < .2) {
                let creeps = bank.pos.findInRange<Creep>(FIND_CREEPS, 1);
                let expectedDamage = 0;
                for (let creep of creeps) {
                    expectedDamage += creep.ticksToLive * creep.getActiveBodyparts(ATTACK) * 30;
                }
                if (expectedDamage > bank.hits) {
                    console.log(`POWER: last wave needed for bank has arrived, ${this.operation.name}`);
                    currentBank.finishing = true;
                }
            }
        }
        if (Game.time > currentBank.timeout) {
            Notifier.log(`POWER: bank timed out ${JSON.stringify(currentBank)}, removing room from powerObservers`);
            delete Memory.powerObservers[this.room.name][this.memory.currentBank.pos.roomName];
            this.memory.currentBank = undefined;
        }
    }

    private scanForBanks(observer: StructureObserver) {

        if (observer.observation && observer.observation.purpose === this.name) {
            let room = observer.observation.room;
            let bank = observer.observation.room.findStructures<StructurePowerBank>(STRUCTURE_POWER_BANK)[0];
            if (bank && bank.ticksToDecay > 4500 && room.findStructures(STRUCTURE_WALL).length === 0
                && bank.power >= Memory.playerConfig.powerMinimum) {
                console.log("\\o/ \\o/ \\o/", bank.power, "power found at", room, "\\o/ \\o/ \\o/");
                this.memory.currentBank = {
                    pos: bank.pos,
                    hits: bank.hits,
                    power: bank.power,
                    distance: Memory.powerObservers[this.room.name][room.name],
                    timeout: Game.time + bank.ticksToDecay,
                    posCount: bank.pos.openAdjacentSpots(true).length,
                    wavesLeft: 3,
                };
                return;
            }
        }

        if (this.spawnGroup.averageAvailability < .5 || Math.random() > .2) { return; }

        let scanData = Memory.powerObservers[this.room.name];
        if (this.memory.scanIndex >= Object.keys(scanData).length) { this.memory.scanIndex = 0; }
        let roomName = Object.keys(scanData)[this.memory.scanIndex++];
        observer.observeRoom(roomName, this.name);
    }
}
