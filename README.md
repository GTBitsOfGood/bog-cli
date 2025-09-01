# bog-cli
This is the repository for Bits of Good's internal CLI used to manage integrations with internal tools to our applications.

## Local Setup
After cloning this repository locally, install the necessary packages using `npm i`. This sets up the project locally, but to run commands, follow the steps below.

## Running/Testing Commands Locally
To run commands based on your local code, run the following commands:

```
npm run dev
npm run link
```

When you are making changes to the CLI, it is recommended to have `npm run dev` running in the background as it can watch for your changes actively.

To run commands, prepend one of the below commands with `bog-cli`. For example, `bog-cli design-system init` will run the design system init command below.

## Supported Commands
These are the current commands this CLI supports. All commands support the `-h/--help` flags.

- `design-system`
  - `init`: Initializes the design system in an existing React/Next.js project. This command gives you the option to install Tailwind V4, the dependencies for the design system, our global stylesheet containing our theme, and our fonts directly into your project.
  - `add`: Adds some or all of the design system's components to your project. It does so by directly injecting the code for our component into the user's project so that the developer can edit our components however they need to.
    - `-a/--all`: Automatically selects all design system components to be added.