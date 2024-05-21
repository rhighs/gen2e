# Gen2E CLI

A simple CLI program allowing interfacing to the Gen2E interpreter via both __interpret__ and ***REPL*** mode. Via cli arguments you can convert a `.gen2e` file into straight playwright code or `gen2e` IL.

## What is a `.gen2e` file?

This type of file is really just a list of phrases in plain english, each phrase is put into a new line and tells the AI agent what actions
it must perform in order to achieve your final goal.

e.g.
```
# Perform a google search

Navigate to google.com
Click on "accept all" if a modal about privacy is present present
Type "Where the aliens at?" in the search bar and press enter on the keyboard
```

These 3, very simple tasks will be converted each to a gen2e library expression; which in turn will
gen evaluated by the gen2e agent and converted into playwright test code.

The output format for the default command can be selected via params `gen2e` or `playwright` to `--imode <param>`.