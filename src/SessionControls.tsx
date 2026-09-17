import { createContext, useContext } from 'react';
import { ThemeToggle } from './ThemeToggle';
type SessionActions = {
 email: string; admin: boolean;
 signOut: () => void;
};
export const SessionContext = createContext<SessionActions | null>(null);
export function SessionControls() {
 const session = useContext(SessionContext);
 if (!session) return null;
 return <div className="header-session" aria-label="Sesión de usuario">
  <ThemeToggle />
  <span className="header-session-identity" title={session.email}>{session.email}{session.admin&&<small>Administrador</small>}</span>
  <button type="button" className="ghost-button" onClick={session.signOut}>Cerrar sesión</button>
 </div>;
}
