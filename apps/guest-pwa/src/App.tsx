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
import {
  SpaHomePage,
  SpaTreatmentsGuestPage,
  SpaTherapistsGuestPage,
  SpaBookPage,
  SpaMyAppointmentsPage,
  SpaPackagesGuestPage,
  SpaMembershipsGuestPage,
  SpaCalendarGuestPage,
} from "./pages/Spa";
import {
  EventsBrowsePage,
  EventDetailPage,
  EventTicketsPage,
  EventSeatingGuestPage,
  MyTicketsPage,
  MyEventsPage,
} from "./pages/Events";
import {
  CinemaBrowsePage,
  CinemaDetailPage,
  CinemaShowtimesGuestPage,
  CinemaSeatsGuestPage,
  CinemaMyTicketsPage,
} from "./pages/Cinema";
import { NotificationsPage } from "./pages/Notifications";
import { GuestPaymentsPage, GuestInvoicesPage, GuestReceiptsPage } from "./pages/Billing";
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
        <Route path="/spa" element={<SpaHomePage />} />
        <Route path="/spa/treatments" element={<SpaTreatmentsGuestPage />} />
        <Route path="/spa/therapists" element={<SpaTherapistsGuestPage />} />
        <Route path="/spa/calendar" element={<SpaCalendarGuestPage />} />
        <Route path="/spa/book" element={<SpaBookPage />} />
        <Route path="/spa/my-appointments" element={<SpaMyAppointmentsPage />} />
        <Route path="/spa/packages" element={<SpaPackagesGuestPage />} />
        <Route path="/spa/memberships" element={<SpaMembershipsGuestPage />} />
        <Route path="/events" element={<EventsBrowsePage />} />
        <Route path="/events/my-tickets" element={<MyTicketsPage />} />
        <Route path="/events/my-events" element={<MyEventsPage />} />
        <Route path="/events/:id" element={<EventDetailPage />} />
        <Route path="/events/:id/tickets" element={<EventTicketsPage />} />
        <Route path="/events/:id/seating" element={<EventSeatingGuestPage />} />
        <Route path="/cinema" element={<CinemaBrowsePage />} />
        <Route path="/cinema/my-tickets" element={<CinemaMyTicketsPage />} />
        <Route path="/cinema/:id" element={<CinemaDetailPage />} />
        <Route path="/cinema/:id/showtimes" element={<CinemaShowtimesGuestPage />} />
        <Route path="/cinema/:id/seats" element={<CinemaSeatsGuestPage />} />
        <Route path="/stay" element={<StayBrowsePage />} />
        <Route path="/stay/room-types/:id" element={<RoomTypeDetailPage />} />
        <Route path="/book" element={<BookEnginePage />} />
        <Route path="/my-bookings" element={<MyBookingsPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/payments" element={<GuestPaymentsPage />} />
        <Route path="/invoices" element={<GuestInvoicesPage />} />
        <Route path="/receipts" element={<GuestReceiptsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
