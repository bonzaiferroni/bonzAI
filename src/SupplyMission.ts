import {Mission} from "./Mission";
import {Operation} from "./Operation";
import {TransportAnalysis} from "./interfaces";
export class SupplyMission extends Mission {

    carts: Creep[];

    consumers: Creep[];
    analysis: TransportAnalysis;

    /**
     * General-purpose energy supplying to worker creeps, can be used to supply upgraders, builders, etc.
     * Suited for use as a nested mession
     * @param operation
     * @param name
     * @param consumers - An array of creeps to be supplied
     * @param analysis
     * @param allowSpawn
     */

    constructor(operation: Operation, name: string, consumers: Creep[], analysis: TransportAnalysis,
                allowSpawn: boolean = true ) {
        super(operation, name, allowSpawn);
        this.consumers = consumers;
        this.analysis = analysis;
    }

    initMission() {
        this.consumers = _.sortBy(this.consumers, (c: Creep) => c.carry.energy);
    }

    roleCall() {
        let cartBody = () => { return this.analysis.body; };
        let memory = { scavanger: RESOURCE_ENERGY };
        this.carts = this.headCount(this.name, cartBody, this.analysis.cartsNeeded, {prespawn: 10, memory: memory} );
    }

    missionActions() {
        for (let cart of this.carts) {
            this.cartActions(cart);
        }
    }

    private cartActions(cart: Creep) {
        if (cart.carry.energy < cart.carryCapacity) {
            this.procureEnergy(cart, this.consumers[0]);
            return;
        }

        // has energy
        let consumer = this.consumers[0];
        if (!consumer || consumer.carry.energy > consumer.carryCapacity * 0.5) {
            cart.idleOffRoad(this.flag);
            return;
        }

        // has target with room for more energy
        let outcome = cart.transfer(consumer, RESOURCE_ENERGY);
        if (outcome === ERR_NOT_IN_RANGE) {
            cart.blindMoveTo(consumer);
        }
        else if (outcome === OK) {
            this.procureEnergy(cart, this.consumers[0]);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
    }
}