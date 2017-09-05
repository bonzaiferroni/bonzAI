import {Mission} from "./Mission";
import {BountyCommander, BountyOperation} from "../operations/BountyOperation";
import {CombatMission} from "./CombatMission";
import {CombatAgent} from "../agents/CombatAgent";
import {HostileAgent} from "../agents/HostileAgent";
import {AgentManifest} from "./EasyMission";

export class BountyMission extends CombatMission {

    protected commander: BountyCommander;
    protected attackStructures = true;

    constructor(operation: BountyOperation, commander: BountyCommander) {
        super(operation, "bounty", operation.roomName);
        this.commander = commander;
    }

    protected buildManifest(): AgentManifest {
        let manifest: AgentManifest = {
            bounty: {
                agentClass: CombatAgent,
                max: () => 1,
                body: this.bountyBody,
                actions: this.combatActions,
                options: {
                    freelance: {
                        roomName: this.targetName,
                        roleName: "ranger",
                        noNewSpawn: true,
                        allowedRange: 4,
                    },
                },
            },
        };
        return manifest;
    }

    protected bountyBody = () => {
        return this.rangerBody(5);
    };
}
