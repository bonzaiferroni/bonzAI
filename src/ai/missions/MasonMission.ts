import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {MasonGuru} from "./MasonGuru";
import {Agent} from "./Agent";
import {MasonAgent} from "./MasonAgent";

export class MasonMission extends Mission {

    masons: Creep[];
    carts: Creep[];
    hostiles: Creep[];
    analyzer: MasonGuru;

    constructor(operation: Operation) {
        super(operation, "mason");
    }

    initMission() {
        this.analyzer = new MasonGuru(this);
        this.hostiles = this.analyzer.getHostiles();
    }

    roleCall() {
        let maxMasons = 0;
        if (this.analyzer.needMason()) {
            maxMasons = 1;
        }
        this.masons = this.headCount("mason", () => this.workerBody(16, 8, 12), maxMasons);

        let maxCarts = 0;
        if (maxMasons > 0 && this.hostiles.length > 0) {
            maxCarts = 1;
        }

        this.carts = this.headCount("masonCart", () => this.workerBody(0, 4, 2), maxCarts);
    }

    missionActions() {

        for (let mason of this.masons) {
            let agent = new MasonAgent(mason, this);
            if (this.hostiles.length > 0) {
                this.sandbagActions(agent);
            }
            else {
                this.masonActions(agent);
            }
        }

        for (let cart of this.carts) {
            this.masonCartActions(new Agent(cart, this));
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        this.analyzer.recheckMasonNeed();
    }

    private masonActions(agent: MasonAgent) {

        let rampart = agent.getRampart();
        if (!rampart) {
            agent.idleOffRoad();
            return;
        }

        agent.repairRampart(rampart);

        let stolen = false;
        if (!agent.isFull(200)) {
            stolen = agent.stealNearby(STRUCTURE_EXTENSION) === OK;
        }

        if (agent.isFull(300) || stolen) {
            agent.idleNear(rampart, 3);
            return;
        }
        else {
            let extension = agent.getExtension(rampart);
            if (agent.creep.name === `lima0_mason_82`) { console.log(`${extension.pos}`)}
            let outcome = agent.pickup(extension, RESOURCE_ENERGY);
            if (outcome === OK && !agent.creep.pos.inRangeTo(rampart, 3)) {
                agent.travelTo(rampart);
            }
        }
    }

    private sandbagActions(agent: MasonAgent) {
        let construction = agent.findConstruction();
        if (construction) {
            agent.build(construction);
            return;
        }

        let sandbag = this.analyzer.getBestSandbag(agent);
        if (sandbag) {

        }
    }

    private masonCartActions(agent: Agent) {

        let lowestMason = _(this.masons).sortBy((c: Creep) => c.carry.energy).head();
        if (!lowestMason || !this.room.storage) {
            agent.idleOffRoad();
            return;
        }

        if (agent.isFull()) {
            let outcome = agent.deliver(lowestMason, RESOURCE_ENERGY);
            if (outcome === OK) {
                agent.travelTo(this.room.storage)
            }
        }
        else {
            let outcome = agent.pickup(this.room.storage, RESOURCE_ENERGY);
            if (outcome === OK) {
                agent.travelTo(lowestMason);
            }
        }
    }
}