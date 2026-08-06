import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { ModulesPage } from "./pages/Modules";
import { CustomersPage, CustomerDetailPage, CustomerSegmentsPage, CustomerTagsPage, CustomerInteractionsPage, CustomerFeedbackPage, CustomerConsentPage, CustomerLoyaltyPage } from "./pages/Customers";
import {
  StaffNotificationsPage,
  NotificationTemplatesPage,
  NotificationRulesPage,
  NotificationDeliveriesPage,
  NotificationPreferencesPage,
} from "./pages/Notifications";
import {
  BillingDashboardPage,
  BillingInvoicesPage,
  BillingPaymentsPage,
  BillingRefundsPage,
  BillingSettlementsPage,
  BillingTaxesPage,
} from "./pages/Billing";
import { StaffPage } from "./pages/Staff";
import { SettingsPage } from "./pages/Settings";
import { OperationsPage } from "./pages/Operations";
import { PropertiesPage } from "./pages/accommodation/Properties";
import { RoomTypesPage } from "./pages/accommodation/RoomTypes";
import { RoomsPage } from "./pages/accommodation/Rooms";
import { ReservationsPage } from "./pages/accommodation/Reservations";
import { CalendarPage } from "./pages/accommodation/Calendar";
import { GuestsPage } from "./pages/accommodation/Guests";
import { HousekeepingPage } from "./pages/accommodation/Housekeeping";
import { MaintenancePage } from "./pages/accommodation/Maintenance";
import { BookingResourcesPage } from "./pages/booking/Resources";
import { BookingBookingsPage } from "./pages/booking/Bookings";
import { BookingCalendarPage } from "./pages/booking/Calendar";
import { BookingSchedulesPage } from "./pages/booking/Schedules";
import { BookingPoliciesPage } from "./pages/booking/Policies";
import { BookingWaitlistPage } from "./pages/booking/Waitlist";
import { BookingTimelinePage } from "./pages/booking/Timeline";
import { BookingAvailabilityPage } from "./pages/booking/Availability";
import { CatalogHomePage, CategoriesPage } from "./pages/commerce/Catalog";
import { ServicesPage, ProductsPage, PackagesPage } from "./pages/commerce/Offerings";
import {
  PricingPage,
  PromotionsPage,
  MediaPage,
  AddonsPage,
  UpsellsPage,
  ChannelsPage,
} from "./pages/commerce/CommerceOps";
import { DiningDashboardPage, DiningTablesPage } from "./pages/dining/Dashboard";
import {
  DiningReservationsPage,
  DiningMenusPage,
  DiningOrdersPage,
  DiningKitchenPage,
  DiningShiftsPage,
} from "./pages/dining/Ops";
import { FitnessDashboardPage, FitnessFacilitiesPage } from "./pages/fitness/Dashboard";
import {
  FitnessPlansPage,
  FitnessMembershipsPage,
  FitnessMembersPage,
  FitnessClassesPage,
  FitnessCalendarPage,
  FitnessTrainersPage,
  FitnessTrainingPage,
  FitnessAttendancePage,
  FitnessCheckInsPage,
  FitnessAccessPassesPage,
} from "./pages/fitness/Ops";
import { SpaDashboardPage, SpaFacilitiesPage } from "./pages/spa/Dashboard";
import {
  SpaTreatmentsPage,
  SpaTherapistsPage,
  SpaAppointmentsPage,
  SpaCalendarPage,
  SpaClientsPage,
  SpaConsultationsPage,
  SpaNotesPage,
  SpaWellnessPage,
  SpaPackagesPage,
  SpaMembershipsPage,
  SpaWaitlistPage,
  SpaRoomsPage,
} from "./pages/spa/Ops";
import { EventsDashboardPage, EventsVenuesPage } from "./pages/events/Dashboard";
import {
  EventsListPage,
  EventsTicketsPage,
  EventsCalendarPage,
  EventsAttendeesPage,
  EventsSeatingPage,
  EventsPackagesPage,
  EventsWaitlistPage,
  EventsRentalsPage,
} from "./pages/events/Ops";
import { CinemaDashboardPage, CinemaVenuesPage } from "./pages/cinema/Dashboard";
import {
  CinemaContentPage,
  CinemaShowtimesPage,
  CinemaSeatsPage,
  CinemaTicketsPage,
  CinemaAttendeesPage,
  CinemaConcessionsPage,
  CinemaShiftsPage,
} from "./pages/cinema/Ops";
import { OpsDashboardPage, OpsLocationsPage, OpsInventoryPage } from "./pages/operations/Dashboard";
import {
  OpsStockPage,
  OpsTransfersPage,
  OpsCountsPage,
  OpsAlertsPage,
  OpsSuppliersPage,
  OpsPurchaseRequestsPage,
  OpsAssetsPage,
  OpsMaintenancePage,
  OpsTasksPage,
} from "./pages/operations/Ops";
import { StaffShell } from "./components/StaffShell";
import { RequireStaff } from "./components/RequireStaff";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireStaff>
            <StaffShell />
          </RequireStaff>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/modules" element={<ModulesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/segments" element={<CustomerSegmentsPage />} />
        <Route path="/customers/tags" element={<CustomerTagsPage />} />
        <Route path="/customers/interactions" element={<CustomerInteractionsPage />} />
        <Route path="/customers/feedback" element={<CustomerFeedbackPage />} />
        <Route path="/customers/consent" element={<CustomerConsentPage />} />
        <Route path="/customers/loyalty" element={<CustomerLoyaltyPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/notifications" element={<StaffNotificationsPage />} />
        <Route path="/notifications/templates" element={<NotificationTemplatesPage />} />
        <Route path="/notifications/rules" element={<NotificationRulesPage />} />
        <Route path="/notifications/deliveries" element={<NotificationDeliveriesPage />} />
        <Route path="/notifications/preferences" element={<NotificationPreferencesPage />} />
        <Route path="/billing" element={<BillingDashboardPage />} />
        <Route path="/billing/invoices" element={<BillingInvoicesPage />} />
        <Route path="/billing/payments" element={<BillingPaymentsPage />} />
        <Route path="/billing/refunds" element={<BillingRefundsPage />} />
        <Route path="/billing/settlements" element={<BillingSettlementsPage />} />
        <Route path="/billing/taxes" element={<BillingTaxesPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/commerce" element={<CatalogHomePage />} />
        <Route path="/commerce/categories" element={<CategoriesPage />} />
        <Route path="/commerce/services" element={<ServicesPage />} />
        <Route path="/commerce/products" element={<ProductsPage />} />
        <Route path="/commerce/packages" element={<PackagesPage />} />
        <Route path="/commerce/pricing" element={<PricingPage />} />
        <Route path="/commerce/promotions" element={<PromotionsPage />} />
        <Route path="/commerce/coupons" element={<PromotionsPage />} />
        <Route path="/commerce/media" element={<MediaPage />} />
        <Route path="/commerce/addons" element={<AddonsPage />} />
        <Route path="/commerce/upsells" element={<UpsellsPage />} />
        <Route path="/commerce/pricing-rules" element={<PricingPage />} />
        <Route path="/commerce/channels" element={<ChannelsPage />} />
        <Route path="/dining" element={<DiningDashboardPage />} />
        <Route path="/dining/tables" element={<DiningTablesPage />} />
        <Route path="/dining/reservations" element={<DiningReservationsPage />} />
        <Route path="/dining/menus" element={<DiningMenusPage />} />
        <Route path="/dining/orders" element={<DiningOrdersPage />} />
        <Route path="/dining/kitchen" element={<DiningKitchenPage />} />
        <Route path="/dining/shifts" element={<DiningShiftsPage />} />
        <Route path="/fitness" element={<FitnessDashboardPage />} />
        <Route path="/fitness/facilities" element={<FitnessFacilitiesPage />} />
        <Route path="/fitness/members" element={<FitnessMembersPage />} />
        <Route path="/fitness/plans" element={<FitnessPlansPage />} />
        <Route path="/fitness/memberships" element={<FitnessMembershipsPage />} />
        <Route path="/fitness/classes" element={<FitnessClassesPage />} />
        <Route path="/fitness/calendar" element={<FitnessCalendarPage />} />
        <Route path="/fitness/trainers" element={<FitnessTrainersPage />} />
        <Route path="/fitness/training" element={<FitnessTrainingPage />} />
        <Route path="/fitness/attendance" element={<FitnessAttendancePage />} />
        <Route path="/fitness/check-ins" element={<FitnessCheckInsPage />} />
        <Route path="/fitness/access-passes" element={<FitnessAccessPassesPage />} />
        <Route path="/spa" element={<SpaDashboardPage />} />
        <Route path="/spa/facilities" element={<SpaFacilitiesPage />} />
        <Route path="/spa/rooms" element={<SpaRoomsPage />} />
        <Route path="/spa/appointments" element={<SpaAppointmentsPage />} />
        <Route path="/spa/calendar" element={<SpaCalendarPage />} />
        <Route path="/spa/treatments" element={<SpaTreatmentsPage />} />
        <Route path="/spa/therapists" element={<SpaTherapistsPage />} />
        <Route path="/spa/clients" element={<SpaClientsPage />} />
        <Route path="/spa/consultations" element={<SpaConsultationsPage />} />
        <Route path="/spa/notes" element={<SpaNotesPage />} />
        <Route path="/spa/wellness" element={<SpaWellnessPage />} />
        <Route path="/spa/packages" element={<SpaPackagesPage />} />
        <Route path="/spa/memberships" element={<SpaMembershipsPage />} />
        <Route path="/spa/waitlist" element={<SpaWaitlistPage />} />
        <Route path="/events" element={<EventsDashboardPage />} />
        <Route path="/events/list" element={<EventsListPage />} />
        <Route path="/events/venues" element={<EventsVenuesPage />} />
        <Route path="/events/calendar" element={<EventsCalendarPage />} />
        <Route path="/events/tickets" element={<EventsTicketsPage />} />
        <Route path="/events/seating" element={<EventsSeatingPage />} />
        <Route path="/events/attendees" element={<EventsAttendeesPage />} />
        <Route path="/events/packages" element={<EventsPackagesPage />} />
        <Route path="/events/rentals" element={<EventsRentalsPage />} />
        <Route path="/events/waitlist" element={<EventsWaitlistPage />} />
        <Route path="/cinema" element={<CinemaDashboardPage />} />
        <Route path="/cinema/venues" element={<CinemaVenuesPage />} />
        <Route path="/cinema/screens" element={<CinemaVenuesPage />} />
        <Route path="/cinema/seats" element={<CinemaSeatsPage />} />
        <Route path="/cinema/content" element={<CinemaContentPage />} />
        <Route path="/cinema/showtimes" element={<CinemaShowtimesPage />} />
        <Route path="/cinema/tickets" element={<CinemaTicketsPage />} />
        <Route path="/cinema/attendees" element={<CinemaAttendeesPage />} />
        <Route path="/cinema/check-in" element={<CinemaAttendeesPage />} />
        <Route path="/cinema/concessions" element={<CinemaConcessionsPage />} />
        <Route path="/cinema/orders" element={<CinemaConcessionsPage />} />
        <Route path="/cinema/shifts" element={<CinemaShiftsPage />} />
        <Route path="/operations" element={<OpsDashboardPage />} />
        <Route path="/operations/inventory" element={<OpsInventoryPage />} />
        <Route path="/operations/locations" element={<OpsLocationsPage />} />
        <Route path="/operations/stock" element={<OpsStockPage />} />
        <Route path="/operations/transfers" element={<OpsTransfersPage />} />
        <Route path="/operations/counts" element={<OpsCountsPage />} />
        <Route path="/operations/alerts" element={<OpsAlertsPage />} />
        <Route path="/operations/suppliers" element={<OpsSuppliersPage />} />
        <Route path="/operations/purchase-requests" element={<OpsPurchaseRequestsPage />} />
        <Route path="/operations/assets" element={<OpsAssetsPage />} />
        <Route path="/operations/maintenance" element={<OpsMaintenancePage />} />
        <Route path="/operations/tasks" element={<OpsTasksPage />} />
        <Route path="/booking/resources" element={<BookingResourcesPage />} />
        <Route path="/booking/bookings" element={<BookingBookingsPage />} />
        <Route path="/booking/schedules" element={<BookingSchedulesPage />} />
        <Route path="/booking/availability" element={<BookingAvailabilityPage />} />
        <Route path="/booking/policies" element={<BookingPoliciesPage />} />
        <Route path="/booking/waitlist" element={<BookingWaitlistPage />} />
        <Route path="/booking/calendar" element={<BookingCalendarPage />} />
        <Route path="/booking/timeline" element={<BookingTimelinePage />} />
        <Route path="/accommodation/properties" element={<PropertiesPage />} />
        <Route path="/accommodation/room-types" element={<RoomTypesPage />} />
        <Route path="/accommodation/rooms" element={<RoomsPage />} />
        <Route path="/accommodation/reservations" element={<ReservationsPage />} />
        <Route path="/accommodation/calendar" element={<CalendarPage />} />
        <Route path="/accommodation/guests" element={<GuestsPage />} />
        <Route path="/accommodation/housekeeping" element={<HousekeepingPage />} />
        <Route path="/accommodation/maintenance" element={<MaintenancePage />} />
        <Route path="/operations/:area" element={<OperationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
