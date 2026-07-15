Let’s build a new app with Skardi as the backend, use NextJs for web development, and eventually deploy to sealos.

1. We want to build an expense management system with 3 roles: admin, employee, reviewer. 
2. All users need to signup using their email and a password they create. Username will be email, no duplicate
3. The first signup user will become the admin. Admin has the full potential to manage promoting or de-promoting a user. 
4. When the next user signs up, they will become employee by default. An employee could create a new expense report with: title, spend category, total amount, date, merchant.
5. The report could have different states, but essentially: draft (still on hand for an employee), submitted, approved or rejected. 
6. A reviewer gets to see all the reports, and they can decide to approve or reject a report. Admin has the full power as mentioned before, so they can also review all the reports. By default, admin has no method to create a new report.
7. A reviewer, however, is also an employee. Reviewers could submit their report too, but only can be reviewed and approved/rejected by the admin. 
8. Admin and reviewer could see individual employee/reviewer spends cumulated in the dashboard. It will be shown as approved vs pending credits, but not showing the rejected credits.
9. For demo purpose, we should have a dedicated frame inside the app page, where it will show what network call and the corresponding SQL query it will make to skardi, in order to demo the capability of skardi to support the full backend functionality, For example, right before we click on any submit/save button, show the sql query we are running on the side, to make it interactive for users. 

This is the functional requirement, implicitly we should have signup/login page, draft report page, view status dashboard (for admin/reviewer), view report page, manage user page (for admin only). The default sqlite hosted on Skardi can be used to store any data schema you created altogether. Push functionalities towards using Skardi pipelines as much as possible.
