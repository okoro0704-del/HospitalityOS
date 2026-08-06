# Invoice Model

Statuses: `draft`, `open`, `partially_paid`, `paid`, `void`, `overdue`

Fields: number, customer, currency, subtotal, discount, tax, total, amountPaid, amountDue, dueDate, paidAt

Lines reference `sourceModule` + `sourceEntityId` when linked to vertical records. Amounts are minor units.
