import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/Home";
import { LifeOsAuthPage } from "./pages/LifeOsAuth";
import { ExplorePage } from "./pages/Explore";
import { BookingsPage } from "./pages/Bookings";
import { ProfilePage } from "./pages/Profile";
import { TenantSelectPage } from "./pages/TenantSelect";
import { StayBrowsePage } from "./pages/StayBrowse";
import { RoomTypeDetailPage } from "./pages/RoomTypeDetail";
import { BookEnginePage } from "./pages/BookEngine";
import { MyBookingsPage } from "./pages/MyBookings";
import { CatalogBrowsePage } from "./pages/CatalogBrowse";
import { CatalogDetailPage } from "./pages/CatalogDetail";
import {
  DiningBrowsePage,
  DiningReservePage,
  DiningReservationsGuestPage,
} from "./pages/Dining";
import {
  FitnessHomePage,
  FitnessMembershipPage,
  FitnessClassesPage,
  FitnessTrainersPage,
  FitnessPassesPage,
} from "./pages/Fitness";
import { Shell } from "./components/Shell";
import { RequireGuest } from "./components/RequireGuest";

export function App() {
  return (
    <Routes>
      <Route path="/auth/lifeos" element={<LifeOsAuthPage />} />
      <Route path="/start" element={<TenantSelectPage />} />
      <Route
        element={
          <RequireGuest>
            <Shell />
          </RequireGuest>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/catalog" element={<CatalogBrowsePage />} />
        <Route path="/catalog/:id" element={<CatalogDetailPage />} />
        <Route path="/dining" element={<DiningBrowsePage />} />
        <Route path="/dining/reserve" element={<DiningReservePage />} />
        <Route path="/dining/reservations" element={<DiningReservationsGuestPage />} />
        <Route path="/fitness" element={<FitnessHomePage />} />
        <Route path="/fitness/membership" element={<FitnessMembershipPage />} />
        <Route path="/fitness/classes" element={<FitnessClassesPage />} />
        <Route path="/fitness/trainers" element={<FitnessTrainersPage />} />
        <Route path="/fitness/passes" element={<FitnessPassesPage />} />
        <Route path="/stay" element={<StayBrowsePage />} />
        <Route path="/stay/room-types/:id" element={<RoomTypeDetailPage />} />
        <Route path="/book" element={<BookEnginePage />} />
        <Route path="/my-bookings" element={<MyBookingsPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
