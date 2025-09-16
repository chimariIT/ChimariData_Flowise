import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Route storage utilities for post-auth navigation
export const routeStorage = {
  // Store the route user intended to visit before authentication
  setIntendedRoute: (route: string) => {
    localStorage.setItem('intended_route', route);
  },
  
  // Get and clear the intended route after successful authentication
  getAndClearIntendedRoute: (): string | null => {
    const route = localStorage.getItem('intended_route');
    if (route) {
      localStorage.removeItem('intended_route');
      return route;
    }
    return null;
  },
  
  // Clear intended route without returning it
  clearIntendedRoute: () => {
    localStorage.removeItem('intended_route');
  }
};

// User greeting utilities
export const userGreetings = {
  // Get formatted user name for display
  getDisplayName: (user: any): string => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    } else if (user?.firstName) {
      return user.firstName;
    } else if (user?.username) {
      return user.username;
    } else if (user?.email) {
      return user.email.split('@')[0]; // Use email prefix as fallback
    }
    return 'User';
  },
  
  // Store user info for logout message
  storeUserForGoodbye: (user: any) => {
    if (user) {
      localStorage.setItem('logout_user_name', userGreetings.getDisplayName(user));
    }
  },
  
  // Get and clear user info for goodbye message
  getAndClearGoodbyeName: (): string | null => {
    const name = localStorage.getItem('logout_user_name');
    if (name) {
      localStorage.removeItem('logout_user_name');
      return name;
    }
    return null;
  }
};
