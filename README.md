# Git Diff Analyser

Git Diff Analyser is a Node.js utility that leverages ChatGPT to analyse the changes in your git diff and provides human-readable feedback. This can be a valuable tool for code reviews, ensuring quality in your codebase.

## Installation

You can install the Git Diff Analyser directly from npm:

```bash
npm i gpt-diff-analyser --global
```

## Usage

Once installed, you can use the `analyse-diff-gpt` command in any git repository to get feedback on the differences between the current branch and a specified target branch:

```bash
analyse-diff-gpt [target-branch]
```

Replace `[target-branch]` with the name of the branch you'd like to compare against. If omitted, it will default to comparing with the `master` branch.

This will run the script on the current git diff and provide feedback.

## Features

- Analyse git diffs with the power of ChatGPT.
- Receive human-readable feedback on your code changes.
- Ability to review each file with changes separately.
- Compare with a specific branch or default to `master`.
- Convenient CLI tool, can be used in any git repository.

## Requirements

- An API key for ChatGPT. Set this up in your environment variables as `OPENAI_API_KEY`.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)
