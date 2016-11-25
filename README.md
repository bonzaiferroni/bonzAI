# bonzaiScreeps
> The self-managing AI used by bonzaiferroni at screeps.com

## Installation
Install [typescript](https://www.npmjs.com/package/typescript) and some system for compiling as you code (eg Webstorm)
run `npm install` to setup grunt for pushing code up.

## Goals of bonzaiScreeps
- Well-balanced resource economy
- Effective raiding and defense
- All game decisions made by AI rather than user
- As a long term goal, decision-making that changes based on the results of previous decisions and through random mutations, resulting in novel behavior

## Overview

Files in this codebase can be neatly separated into two categories: 

1. Abstract classes that that make up the **framework**, currently just Operation and Mission along with the supporting concrete classes SpawnGroup and Empire

  -Empire.ts
  -Operation.ts
  -Mission.ts
  -SpawnGroup.ts
  -main.ts
  -loopHelper.ts
  
2. Concrete classes that extend Operation and Mission that make up the **implementation** of game mechanics / creep behavior. Examples:

  -QuadOperation.ts (bootstrap missions for owned rooms)
  -MiningOpration.ts (bootstrap missions for remote harvesting)
  -PaverMission (pave roads in any room)
  -BodyguardMission (defend against invaders)

### Overview of framework

The archictecture of the framework is readily observed by looking at main.ts and the code contained within the game loop. Creep behavior is always defined in a mission, which also defines the spawning conditions and data-gathering necessary for that class of creeps. Operations are really just a collection of missions that get bootstrapped by placement of a flag in the screep world.

![framework overview](https://docs.google.com/drawings/d/e/2PACX-1vSkzFgLxP8KvcfnKCgeHYgEsPJpSlX2Q2yB03JKrm7UMcRI5Cwi2ZgKhOJ-7PamRqq8UiIgUk4xHJID/pub?w=960&h=720)

### Overview of AI implementation

This repository includes all the missions/operations that make up the bonzaiferroni AI. Players looking to write a completely original AI can simply take the framework and write their own concrete classes that extend Operation and Mission. 
