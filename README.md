# bonzAI
> The self-managing AI used by bonzaiferroni at screeps.com

This is the code running my AI on the MMO programming game [Screeps](https://screeps.com/). Back when I was learning screeps I was always looking for examples of other players' code, so hopefully this can be of some use. I'm still actively developing this code and using it on the MMO server. Searching the code to find vulnerabilities in my raiding/defense is fair game!

For people that are interested in using it on a private server or forking it, I've included some information on how it works. If it seems like people are using it, I will expand on this. If you have any problems or something seems really unclear, please raise an issue. You can also join the discussion in the slack channel [#thunderkittens_public](https://screeps.slack.com/messages/thunderkittens_public/)

I had only been doing javascript/typescript for a few months when I started this. Any advice/guidance from experienced programmers is very welcome.

#### Use on MMO server
Using this code as-is on the MMO server could present some problems. First, the screeps world is most interesting when there are a diversity of ideas/approaches being tried. Second, there will no doubt be gaps in its functionality and undesired behavior. At the moment the code is very passive, but eventually it will start claiming rooms and attacking neighbors (if you are my neighbor, don't worry, I plan to provide an opt-out system).

For these reasons, I don't recommend using it that way without first going through the code and modifying its behavior to what you would like to see. 

## Goals of bonzAI
- All game decisions made by AI rather than user
- As a long term goal, decision-making that changes based on the results of previous decisions and through random mutations, resulting in novel behavior

## Current status on goals
At the moment, rooms are still chosen manually, although I've begun the process that the AI will eventually use. This can currently be found in AutoOperation, which will analyze nearby sources and the room layout and choose the best place to start building structures.

## Additional Information
* [Framework overview](https://github.com/bonzaiferroni/bonzAI/wiki/Framework-Overview)
* [Quickstart](https://github.com/bonzaiferroni/bonzAI/wiki/bonzAI-Quickstart): Write a couple classes that extends Operation and Mission to do all the basic creep behavior

## Installation

### Using `main.js`

If you aren't interested in modifying the typescript (perhaps you just want an opponent on a private server), you can save a lot of time by using the `main.js` file that you will find in the lastStableBuild folder ([right click, save as](https://raw.githubusercontent.com/bonzaiferroni/bonzAI/master/lastStableBuild/main.js)). You can just drop this in your local folder.

Once you have the code pushed to a screeps server: 

1. Find a room and place a spawn
 * If it has trouble determining a layout based on your room/spawn placement, it will let you know in the console. Just try again, perhaps a room with more space and don't place the spawn too close to a source.
2. Place a flag with the name "quad_myBase"

### Typescript

Most of the tooling here has been taken directly from https://github.com/screepers/screeps-typescript-starter

1. Run `npm install` to install dependencies.
2. Create a copy of `config.example.json` and rename it to `config.json`.
3. Then, on the `config.json` file, change the `username` and `password` properties with your Screeps credentials. The `config.json` file is where you set up your development environment. If you want to push your code to another branch, for example.
4. Run `gulp build` to compile/push your code. Run `gulp copyLocal` if you only need the code to go to the path set in `config.json` (like with a private server). Running `gulp watchUpload` or `gulp watchLocal` will have the code watch for changes and push code to the server or your local folder, respectively.

#### Gulp Tasks
A variety of gulp tasks have been provided...

 - `lint` runs TSLint against /src/*
 - `compile-bundled` compiles the code into a single 'main.js' file in the /dist folder.
 - `compile-flattened` compiles the code into the /dist folder but emits any folder structure (required for screeps)
 - `upload` compiles according to your config.json file and uploads to the defaultTarget.
 - `copyLocal` compiles according to your config.json file and copies the result to the local directory
 - `watchUpload` compiles and uploads to the server when a file is saved in your src directory.
 - `watchLocal` compiles and copies to your local path when a file is saved in your src directory.

you can run gulp tasks in the terminal... ` gulp copyLocal `;

tasks are defined in gulpfile.js and you can read more about gulp here...
http://gulpjs.com/

#### TSLint

TSLint checks your TypeScript code for readability, maintainability, and functionality errors, and can also enforce coding style standards.
After each successful compiling of the project, TSLint will parse the TypeScript source files and display a warning for any issues it will find.
This project provides TSLint rules through a `tslint.json` file, which extends the recommended set of rules from TSLint github repository: https://github.com/palantir/tslint/blob/next/src/configs/recommended.ts
Some changes to those rules, which were considered necessary and/or relevant to a proper Screeps project:

 - set the [forin](http://palantir.github.io/tslint/rules/forin/) rule to `false`, it was forcing `for ( ... in ...)` loops to check if object members were not coming from the class prototype.
 - set the [interface-name](http://palantir.github.io/tslint/rules/interface-name/) rule to `false`, in order to allow interfaces that are not prefixed with `I`.
 - set the [no-console](http://palantir.github.io/tslint/rules/no-console/) rule to `false`, in order to allow using `console`.
 - in the [variable-name](http://palantir.github.io/tslint/rules/variable-name/) rule, added `allow-leading-underscore`.

**More info about TSLint:** https://palantir.github.io/tslint/
