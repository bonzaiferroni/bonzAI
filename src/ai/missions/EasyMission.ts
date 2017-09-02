import {Mission} from "./Mission";
import {Operation} from "../operations/Operation";
import {Agent} from "../agents/Agent";
import {HeadCountOptions} from "../../interfaces";

export interface AgentManifest {
    [roleName: string]: AgentManifestItem;
}

export interface AgentManifestItem {
    agentClass: new (creep: Creep, mission: Mission) => Agent;
    body: () => string[];
    max: () => number;
    actions: (agent: Agent) => void;
    options?: HeadCountOptions;
    agents?: Agent[];
}

export abstract class EasyMission extends Mission {

    protected agentManifest: AgentManifest = {};

    constructor(operation: Operation, name: string, allowSpawn?: boolean) {
        super(operation, name, allowSpawn);
    }

    protected init() {
        this.agentManifest = this.buildManifest();
    }

    protected abstract buildManifest(): AgentManifest;

    protected update() {
    }

    protected roleCall() {
        for (let roleName in this.agentManifest) {
            let item = this.agentManifest[roleName];
            item.agents = this.headCountAgents(item.agentClass, roleName, item.body, item.max, item.options);
        }
    }

    protected actions() {
        for (let roleName in this.agentManifest) {
            let item = this.agentManifest[roleName];
            for (let agent of item.agents) {
                item.actions(agent);
            }
        }
    }

    protected finalize() {
    }

    protected invalidateCache() {
    }
}
