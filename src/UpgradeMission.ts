import {Mission} from "./Mission";
import {Operation} from "./Operation";
import {RESERVE_AMOUNT} from "./constants";
import {profiler} from "./profiler";
export class UpgradeMission extends Mission {

    upgraders: Creep[];
    linkUpgraders: Creep[];
    supplyCarts: Creep[];
    paver: Creep;

    battery: StructureContainer | StructureStorage | StructureLink;
    boost: boolean;
    allowUnboosted: boolean;

    /**
     * Controller upgrading. Will look for a suitable controller battery (StructureContainer, StructureStorage,
     * StructureLink) and if one isn't found it will spawn SupplyMission to bring energy to upgraders
     * @param operation
     * @param boost
     * @param allowSpawn
     * @param allowUnboosted
     */

    constructor(operation: Operation, boost: boolean, allowSpawn = true, allowUnboosted = true) {
        super(operation, "upgrade", allowSpawn);
        this.boost = boost;
        this.allowUnboosted = allowUnboosted;
    }

    initMission() {
        if (!this.memory.cartCount) { this.memory.cartCount = 0; }
        this.distanceToSpawn = this.findDistanceToSpawn(this.room.controller.pos);
        this.battery = this.room.controller.getBattery();
    }

    roleCall() {

        // memory
        let memory;
        if (this.boost || this.empire.hasAbundance(RESOURCE_CATALYZED_GHODIUM_ACID, RESERVE_AMOUNT * 2)) {
            memory = {boosts: [RESOURCE_CATALYZED_GHODIUM_ACID], allowUnboosted: this.allowUnboosted};
        }

        if (this.battery && this.spawnGroup.room.storage) {
            let linkUpgraderBody = () => {
                if (this.spawnGroup.maxSpawnEnergy < 800) {
                    return this.workerBody(2, 1, 1);
                }

                if (this.waypoints) {
                    let potency = Math.min(Math.floor((this.spawnGroup.maxSpawnEnergy - 200) / 150), 23);
                    let carry = 4;
                    return this.workerBody(potency, carry, potency);
                }
                else {
                    let potency = Math.min(Math.floor((this.spawnGroup.maxSpawnEnergy - 250) / 150), 30);
                    if (this.room.controller.level === 8 && potency > 15) {
                        potency = 15;
                    }
                    if (this.room.storage) {
                        potency = Math.min(this.room.storage.store[RESOURCE_ENERGY] / 3000, potency);
                    }
                    if (potency < 1) potency = 1;

                    return this.workerBody(potency, 4, Math.ceil(potency / 2));
                }
            };

            // determine max
            if (!this.memory.maxUpgraders) this.memory.maxUpgraders = this.room.controller.getUpgraderPositions().length;
            let max = Math.min(this.memory.maxUpgraders, Math.floor(this.spawnGroup.room.storage.store.energy / 30000), 5);
            if (this.opType === "conquest") max = 1;
            if (this.memory.max !== undefined) max = this.memory.max;
            if (this.room.controller.level === 8) max = 1;
            if (this.room.hostiles.length > 0) max = 0;

            this.linkUpgraders = this.headCount("upgrader", linkUpgraderBody, max, {prespawn: this.distanceToSpawn, memory: memory} );
        }
        else {
            let sourceCount = this.room.find(FIND_SOURCES).length;
            let energyPerTick = sourceCount * 5;
            if (this.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) {
                // construction is a big energy draw, so there is less energy available for upgrading
                energyPerTick = energyPerTick / 4;
            }
            let body;
            if (this.room.controller.level === 8) {
                body = this.workerBody(15, 8, 8);
            }
            else {
                body = this.bodyRatio(2, 1, 1, 1);
            }
            let workPartsPerUpgrader = body.length / 2;
            let max = Math.ceil(energyPerTick / workPartsPerUpgrader);
            let memory = { scavanger: RESOURCE_ENERGY };
            let analysis = this.analyzeTransport(25, workPartsPerUpgrader * max);
            this.supplyCarts = this.headCount("upgraderCart", () => analysis.body, analysis.cartsNeeded,
                {prespawn: this.distanceToSpawn, memory: memory} );

            if (this.supplyCarts.length < analysis.cartsNeeded) {
                max = this.supplyCarts.length;
            }

            let upgraderBody = () => {
                if (this.waypoints) {
                    return this.bodyRatio(1, 1, 1, 1);
                }
                else {
                    return body;
                }
            };
            if (this.room.controller.level === 8) max = 1;
            if (this.room.hostiles.length > 0) max = 0;
            if (this.memory.max !== undefined) {
                max = this.memory.max;
            }

            this.upgraders = this.headCount("upgrader", upgraderBody, max, {prespawn: this.distanceToSpawn, memory: memory});
        }

        if (this.memory.roadRepairIds) {
            this.paver = this.spawnPaver();
        }
    }

    missionActions() {
        if (this.linkUpgraders) {
            let index = 0;
            for (let upgrader of this.linkUpgraders) {
                this.linkUpgraderActions(upgrader, index);
                index++;
            }
        }
        else if (this.upgraders) {
            for (let upgrader of this.upgraders) {
                this.upgraderActions(upgrader);
            }

            let lowest = _(this.upgraders)
                .filter((c: Creep) => c.memory.inPosition)
                .sortBy((c: Creep) => c.carry.energy)
                .head() as Creep;
            for (let cart of this.supplyCarts) {
                this.supplyUpgrader(cart, lowest);
            }
        }

        if (this.paver) {
            this.paverActions(this.paver);
        }

        if (this.room.controller.level >= 4) {
            this.pavePath({pos: this.spawnGroup.pos}, this.room.controller, 4);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        if (Math.random() < .01) this.memory.maxUpgraders = undefined;
        if (Math.random() < .1) this.memory.transportAnalysis = undefined;
    }

    private upgraderActions(upgrader: Creep) {
        if (upgrader.pos.inRangeTo(this.room.controller, 3)) {
            upgrader.upgradeController(this.room.controller);
            upgrader.memory.inPosition = true;
            upgrader.memory.scavanger = RESOURCE_ENERGY;
            upgrader.yieldRoad(this.room.controller);
        }
        else {
            upgrader.blindMoveTo(this.room.controller);
            upgrader.memory.inPosition = false;
        }
    }

    private linkUpgraderActions(upgrader: Creep, index: number) {

        let battery = this.room.controller.getBattery();
        if (!battery) {
            upgrader.idleOffRoad(this.flag);
            return; // early
        }

        let outcome;
        if (battery instanceof StructureContainer && battery.hits < battery.hitsMax * 0.8) {
            outcome = upgrader.repair(battery);
        }
        else {
            outcome = upgrader.upgradeController(this.room.controller);
        }

        let myPosition = this.room.controller.getUpgraderPositions()[index];

        if (myPosition) {
            let range = upgrader.pos.getRangeTo(myPosition);
            if (range > 0) {
                upgrader.blindMoveTo(myPosition);
            }
        }
        else {
            if (upgrader.pos.inRangeTo(battery, 3)) {
                upgrader.yieldRoad(battery);
            }
            else {
                upgrader.blindMoveTo(battery);
            }
        }

        if (upgrader.carry[RESOURCE_ENERGY] < upgrader.carryCapacity / 4) {
            upgrader.withdraw(battery, RESOURCE_ENERGY);
        }
    }

    private supplyUpgrader(cart: Creep, suppliedCreep: Creep) {
        let hasload = this.hasLoad(cart);
        if (!hasload) {
            this.procureEnergy(cart, suppliedCreep);
            return;
        }

        // has energy
        if (!suppliedCreep || suppliedCreep.carry.energy > suppliedCreep.carryCapacity * 0.8) {
            cart.idleOffRoad(this.flag);
            return;
        }

        // has target with room for more energy
        let outcome = cart.transfer(suppliedCreep, RESOURCE_ENERGY);
        if (outcome === ERR_NOT_IN_RANGE) {
            cart.blindMoveTo(suppliedCreep);
        }
        else if (suppliedCreep.carry.energy < suppliedCreep.carryCapacity / 2 && outcome === OK) {
            this.procureEnergy(cart, suppliedCreep);
        }
    }
}