# Expense Manager

A personal money tracker where you point AI at your receipts, bank statements, and screenshots — and it figures out the rest.

## What it does

**Snap a receipt, get a clean record.** Take a photo of a receipt, drag in a PDF statement, or paste a screenshot of a Venmo charge. The app reads the image with Claude and turns it into a real transaction — merchant, amount, date, line items. No typing.

**Ask the AI to reorganize your spending.** Instead of fixed categories like "Food" and "Transport," you tell the app how you want to look at your money:

- *"Group everything I spent on social stuff this month."*
- *"Show me what I'm spending on the kids vs. on myself."*
- *"What did this trip to Japan actually cost me?"*

The data stays the same. The view changes to match the question.

**One inbox for every receipt.** Right now you upload manually. Later, you'll be able to forward emailed receipts to a special address and they show up automatically. Eventually it can read from your Gmail or Drive too.

## What makes it different

Most expense apps make you live with the categories *they* picked. This one keeps your transactions in a clean, boring database — and treats every screen you look at as a question you're asking. Ask a different question, get a different screen.

That means there are no hardcoded dashboards. The "spending by month" view and the "what did I spend on coffee" view and "how much did that wedding weekend run me" view are all the same machinery, just pointed at different slices.

## Phone vs. computer

- **Phone** is for catching things in the moment — snap a receipt at lunch, triage what came in today.
- **Computer** is where you sit down to actually look at things — organize, ask questions, see patterns.

## Built with

Next.js 16, React 19, Supabase (database + file storage + login), Claude Sonnet for reading images and answering questions.
