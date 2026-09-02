# Prompt Builder 🧩
The Modular Prompting Tool - Drag, drop, and assemble reusable prompt components to streamline your workflow!

_A demo recording is attached to the [latest release](https://github.com/TimHayward/Prompt-Builder/releases); it lived in the repository as a 31 MB GIF until it was moved out._

## Documentation
https://github.com/TimHayward/Prompt-Builder

## Getting Started (Self-Hosted) 🚀

This version of Prompt Builder runs as a local web application on your computer, using a SQLite database to store your prompts and components.

**Installation Steps:**

1.  **Clone the Repository:**
    Open your terminal or command prompt and run the following command to clone the project files to your local machine:
    ```bash
    git clone https://github.com/your-username/Prompt-Builder.git 
    ```
    (Replace `https://github.com/your-username/Prompt-Builder.git` with the actual repository URL if different.)
    Navigate into the cloned directory:
    ```bash
    cd Prompt-Builder
    ```

2.  **Install Dependencies:**
    Install the necessary project dependencies using npm:
    ```bash
    npm install
    ```

3.  **Initialize the Database:**
    Set up the local SQLite database by running the initialization script:
    ```bash
    npm run db:init
    ```
    This will create a `database.sqlite` file in the `src/db` directory and set up the required tables.

4.  **Run the Application:**
    Start the development server:
    ```bash
    npm run dev
    ```

5.  **Access Prompt Builder:**
    Open your web browser and go to `http://localhost:3000` (or the port indicated in your terminal if 3000 is in use).

You should now see the Prompt Builder application running locally! Your prompts and component library will be saved in the `database.sqlite` file.

## Variables 🔤

Anything wrapped in double braces becomes an editable field in the Variables pane, and is substituted when you copy the prompt.

| Syntax | Pane shows |
| --- | --- |
| `{{tone}}` | A free-text box |
| `{{mail/teams/calendar}}` | A dropdown of the three options, plus `Custom…` for free text |
| `{{channel: mail/teams/calendar}}` | The same dropdown, labelled `channel` |

A `/` only creates a choice list when there are at least two options and none of them are empty, so `{{https://example.com}}` stays a plain free-text variable. Spacing is ignored — `{{ mail / teams }}` and `{{mail/teams}}` are the same variable. Reuse the same variable across sections by repeating the token; with the labelled form, a bare `{{channel}}` elsewhere shares the value. Leaving a variable empty removes the token from the copied prompt.

## Contribute to Prompt Builder 🤝
We welcome contributions! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Setting up the development environment (Vite/React/TypeScript).

- Submitting pull requests.

- Reporting bugs or suggesting features.

## Backlog 💡
Planned remediations, enhancements, and new features live in [BACKLOG.md](BACKLOG.md). Finished items are archived in [BACKLOG-completed.md](BACKLOG-completed.md).

## Built With 🔧
Frontend: Vite, React, TypeScript, SCSS

Chrome Extension: Manifest V3

## License 📄
This project is licensed under the Apache License 2.0. See LICENSE for details.
