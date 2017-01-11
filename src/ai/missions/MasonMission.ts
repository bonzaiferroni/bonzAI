import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {MasonGuru} from "./MasonGuru";
import {Agent} from "./Agent";
import {MasonAgent} from "./MasonAgent";
import {DeliveryAgent} from "./DeliveryAgent";
import {DefenseGuru} from "../operations/DefenseGuru";

export class MasonMission extends Mission {

    masons: MasonAgent[];
    carts: Agent[];
    guru: MasonGuru;
    defenseGuru: DefenseGuru;

    roles = {
        mason: MasonAgent,
        masonCart: DeliveryAgent,
    };

    constructor(operation: Operation, defenseGuru: DefenseGuru) {
        super(operation, "mason");
        this.defenseGuru = defenseGuru;
    }

    initMission() {
        this.guru = new MasonGuru(this, this.defenseGuru);
    }

    maxMasons = () => {
        if (this.guru.needMason) { return 1; }
        else { return 0; }
    };

    maxCarts = () => {
        if (this.guru.needMason && this.defenseGuru.hostiles.length > 0) { return 1; }
        else { return 0; }
    };

    roleCall() {
        let boosts;
        let allowUnboosted = true;
        if (this.defenseGuru.hostiles.length > 0) {
            boosts = [RESOURCE_CATALYZED_LEMERGIUM_ACID]
            allowUnboosted = !(this.room.terminal && this.room.terminal.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] > 1000);
        }
        this.masons = this.headCount2<MasonAgent>("mason", () => this.workerBody(16, 8, 12), this.maxMasons, {
            boosts: boosts,
            allowUnboosted: allowUnboosted,
            prespawn: 1
        });
        this.carts = this.headCount2<DeliveryAgent>("masonCart", () => this.workerBody(0, 4, 2), this.maxCarts);
    }

    missionActions() {

        for (let mason of this.masons) {
            if (this.defenseGuru.hostiles.length > 0) {
                this.sandbagActions(mason);
            }
            else {
                this.masonActions(mason);
            }
        }

        for (let cart of this.carts) {
            this.masonCartActions(cart);
        }
    }

    finalizeMission() {
    }

    invalidateMissionCache() {
        this.guru.recheckMasonNeed();
    }

    private masonActions(agent: MasonAgent) {

        let rampart = agent.getRampart();
        if (!rampart) {
            agent.idleOffRoad();
            return;
        }

        agent.creep.repair(rampart);

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
            let outcome = agent.pickup(extension, RESOURCE_ENERGY);
            if (outcome === OK && !agent.creep.pos.inRangeTo(rampart, 3)) {
                agent.travelTo(rampart);
            }
        }
    }

    private sandbagActions(agent: MasonAgent) {

        if (agent.creep.ticksToLive > 400 &&
            !agent.creep.body.find((p: BodyPartDefinition) => p.boost === RESOURCE_CATALYZED_LEMERGIUM_ACID)) {
            if (this.room.terminal && this.room.terminal.store[RESOURCE_CATALYZED_LEMERGIUM_ACID] > 1000) {
                agent.resetPrep();
            }
        }

        let construction = agent.findConstruction();
        if (construction) {
            agent.travelToAndBuild(construction);
            return;
        }

        let emergencySandbag = this.guru.getEmergencySandbag(agent);
        if (emergencySandbag) {
            if (agent.pos.inRangeTo(emergencySandbag, 3)) {
                agent.creep.repair(emergencySandbag);
            }
            else {
                agent.travelTo(emergencySandbag);
            }
        }
    }

    private masonCartActions(agent: Agent) {

        let lowestMason = _(this.masons).sortBy((a: Agent) => a.creep.carry.energy).head();
        if (!lowestMason || !this.room.storage) {
            agent.idleOffRoad();
            return;
        }

        if (agent.isFull()) {
            let outcome = agent.deliver(lowestMason.creep, RESOURCE_ENERGY);
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