# Expense Manager

An adaptive bookkeeping tool where you don't just track your money — you redesign the way you look at it, by talking to AI.

## The idea

Most finance apps hand you someone else's idea of what a budget looks like: their categories, their charts, their dashboard, their tone. You either live with it or you give up.

This one starts the other way around. The transactions sit in a clean, boring database. Everything you see on top of them — categories, layout, charts, colors, wording, what's emphasized, what's hidden — is something you can change by asking. You don't need to know what you want up front. You try things, see if you like them, and iterate.

It's hard to commit to a budget display you didn't design — and hard to design one when you don't yet know what you want. Iterating with AI on your real data is faster than any settings panel, and lets you stumble into a layout that fits how *you* actually think about money.

## What you can change (which is everything)

**Specific tweaks.** *"Move the income chart to the top."* *"Make the spending breakdown a donut instead of a bar chart."* *"Don't show cents."* *"Group these three categories together."*

**Vague gestures.** *"I want more focus on what I'm spending on the kids."* *"This feels cluttered."* *"Make it feel less like accounting."* The AI takes a swing and shows you the result. Keep what works, throw out what doesn't, ask for another pass.

**Your own categories and views.** Forget "Food" and "Transport." Define your own — *social stuff, kid stuff, the Japan trip, things I regret* — and ask for a screen built around them. The data underneath doesn't move; only the lens does.

This works because the UI isn't hardcoded. Every screen is generated from a layout description the AI can read, modify, and re-render. "Redesign this page" is a thing you can actually ask for.

## Getting the data in

**Snap a receipt, get a clean record.** Photo of a receipt, drag-in PDF statement, screenshot of a Venmo charge — the app reads it with Claude and turns it into a real transaction (merchant, amount, date, line items). No typing.

**One inbox for every receipt.** Today: manual upload. Soon: forward emailed receipts to a dedicated address. Later: read directly from Gmail or Drive.

## Phone vs. computer

- **Phone** — catching things in the moment. Snap a receipt at lunch, triage what came in today.
- **Computer** — sitting down to look at things. Reorganize, ask questions, redesign the view, see patterns.

## Built with

Next.js 16, React 19, Supabase (database + file storage + login), Claude Sonnet for reading receipts and generating/modifying layouts.
