import { Redirect, Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { AppShell } from '@/components/layout/app-shell'
import { NewTaskDialog } from '@/components/new-task-dialog'
import { ConfirmRemoveDialog } from '@/components/confirm-remove'
import type { TaskFilter } from '@/hooks/aria2'
import { TaskListPage } from '@/pages/task-list'
import { TaskDetailPage } from '@/pages/task-detail'
import { Aria2OptionsPage } from '@/pages/aria2-options'
import { PreferencesPage } from '@/pages/preferences'
import { StatusPage } from '@/pages/status'

const filters: TaskFilter[] = ['active', 'waiting', 'stopped', 'all']

export default function App() {
  return (
    <Router hook={useHashLocation}>
      <AppShell>
        <Switch>
          <Route path="/">
            <Redirect to="/tasks/active" replace />
          </Route>
          <Route path="/tasks/:filter">
            {({ filter }) =>
              filters.includes(filter as TaskFilter) ? (
                <TaskListPage key={filter} filter={filter as TaskFilter} />
              ) : (
                <Redirect to="/tasks/active" replace />
              )
            }
          </Route>
          <Route path="/task/:gid">{({ gid }) => <TaskDetailPage key={gid} gid={gid} />}</Route>
          <Route path="/aria2/:group?">{({ group }) => <Aria2OptionsPage group={group} />}</Route>
          <Route path="/settings/:section?">{({ section }) => <PreferencesPage section={section} />}</Route>
          <Route path="/status" component={StatusPage} />
          <Route>
            <Redirect to="/tasks/active" replace />
          </Route>
        </Switch>
      </AppShell>
      <NewTaskDialog />
      <ConfirmRemoveDialog />
    </Router>
  )
}
