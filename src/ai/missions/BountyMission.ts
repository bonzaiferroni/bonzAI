import {Mission} from "./Mission";
import {BountyCommander, BountyOperation} from "../operations/BountyOperation";
import {PeaceMission} from "./PeaceMission";
import {PeaceAgent} from "../agents/PeaceAgent";
import {HostileAgent} from "../agents/HostileAgent";
import {AgentManifest} from "./EasyMission";

export class BountyMission extends PeaceMission {

    protected commander: BountyCommander;
    protected attackStructures = true;

    constructor(operation: BountyOperation, commander: BountyCommander) {
        super(operation, "bounty", operation.roomName);
        this.commander = commander;
    }

    protected buildManifest(): AgentManifest {
        let manifest: AgentManifest = {
            bounty: {
                agentClass: PeaceAgent,
                max: () => 1,
                body: this.bountyBody,
                actions: this.peaceActions,
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
