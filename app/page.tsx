"use client"

import React, { useState, useEffect, useRef } from "react"
import Image from "next/image"
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    Menu,
    Clock,
    X,
    LogIn,
    LogOut,
    CalendarIcon,
    Trash2,
    Phone,
    User,
    Check,
    Calendar,
    Upload,
    Download,
    RefreshCw,
    Database,
} from "lucide-react"
import { db } from "./firebase"
import { collection, addDoc, deleteDoc, doc, getDocs, query, orderBy, onSnapshot } from "firebase/firestore"

// Definim tipurile pentru datele noastre
type ClientInfo = {
    firstName: string
    lastName: string
    phone: string
}

type Event = {
    id: string
    title: string
    startTime: string
    endTime: string
    startDate: string
    endDate: string
    color: string
    type: "admin-available" | "booked" | "regular"
    clientInfo?: ClientInfo
    createdAt: string
    lastUpdated: string
}

// Definim tipul pentru sloturile de timp
type TimeSlot = {
    startTime: string
    endTime: string
    startDate: string
    endDate: string
    parentId: string
}

// Colecția Firestore
const EVENTS_COLLECTION = "events"

// Define storage keys
const STORAGE_KEYS = {
    EVENTS: "calendar_events",
    LAST_UPDATE: "last_update_time",
    SYNC_COUNTER: "sync_counter",
}

export default function Home() {
    const [isLoaded, setIsLoaded] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [password, setPassword] = useState("")
    const [loginError, setLoginError] = useState("")
    const [currentView, setCurrentView] = useState("week")
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
    const [showAddEventModal, setShowAddEventModal] = useState(false)
    const [showBookingModal, setShowBookingModal] = useState(false)
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([])
    const [isDataLoading, setIsDataLoading] = useState(false)
    const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced")
    const [sessionId] = useState(() => Math.random().toString(36).substring(2, 15))
    const [syncEnabled, setSyncEnabled] = useState(true)
    const [syncInterval, setSyncInterval] = useState(5000) // 5 secunde implicit
    const [lastUpdateTime, setLastUpdateTime] = useState<string>(new Date().toISOString())

    // Referință pentru intervalul de polling
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

    // Referință pentru a ține minte ultima dată când am verificat actualizările
    const lastCheckRef = useRef<string>(new Date().toISOString())

    // Referință pentru unsubscribe de la Firestore listener
    const unsubscribeRef = useRef<() => void | null>()

    // Booking form state
    const [bookingForm, setBookingForm] = useState({
        firstName: "",
        lastName: "",
        phone: "",
    })

    // Date state
    const [currentDate, setCurrentDate] = useState(new Date())
    const [selectedDate, setSelectedDate] = useState(new Date())

    // New event state with simplified fields
    const [newEvent, setNewEvent] = useState({
        title: "Interval Disponibil",
        startTime: "09:00",
        endTime: "17:00",
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        type: "admin-available" as const,
    })

    // State for events
    const [events, setEvents] = useState<Event[]>([])

    // Admin password - in a real app, this would be handled securely on the server
    const ADMIN_PASSWORD = "admin123"

    // Check if a date is today - MUTATĂ AICI ÎNAINTE DE A FI UTILIZATĂ
    const isToday = (date: Date) => {
        const today = new Date()
        return (
            date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()
        )
    }

    // Get week days based on current date
    const getWeekDays = () => {
        const days = []
        const dayNames = ["DUM", "LUN", "MAR", "MIE", "JOI", "VIN", "SÂM"]

        // Find the first day of the week (Sunday)
        const firstDayOfWeek = new Date(currentDate)
        const day = currentDate.getDay()
        firstDayOfWeek.setDate(currentDate.getDate() - day)

        // Generate 7 days starting from Sunday
        for (let i = 0; i < 7; i++) {
            const date = new Date(firstDayOfWeek)
            date.setDate(firstDayOfWeek.getDate() + i)
            days.push({
                name: dayNames[i],
                date: date,
                dateNum: date.getDate(),
                month: date.getMonth(),
                year: date.getFullYear(),
                isToday: isToday(date),
            })
        }

        return days
    }

    // Get month days based on current date
    const getMonthDays = () => {
        const days = []
        const dayNames = ["D", "L", "M", "M", "J", "V", "S"]

        // Get first day of the month
        const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)

        // Get the day of the week for the first day (0 = Sunday, 1 = Monday, etc.)
        const firstDayOfWeek = firstDayOfMonth.getDay()

        // Add days from previous month to fill the first week
        const prevMonthLastDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0).getDate()
        for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, prevMonthLastDay - i)
            days.push({
                name: dayNames[date.getDay()],
                date: date,
                dateNum: date.getDate(),
                month: date.getMonth(),
                year: date.getFullYear(),
                isCurrentMonth: false,
                isToday: isToday(date),
            })
        }

        // Add days of current month
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i)
            days.push({
                name: dayNames[date.getDay()],
                date: date,
                dateNum: i,
                month: date.getMonth(),
                year: date.getFullYear(),
                isCurrentMonth: true,
                isToday: isToday(date),
            })
        }

        // Add days from next month to complete the grid (6 rows x 7 days = 42 cells)
        const remainingDays = 42 - days.length
        for (let i = 1; i <= remainingDays; i++) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, i)
            days.push({
                name: dayNames[date.getDay()],
                date: date,
                dateNum: i,
                month: date.getMonth(),
                year: date.getFullYear(),
                isCurrentMonth: false,
                isToday: isToday(date),
            })
        }

        return days
    }

    const [weekDays, setWeekDays] = useState(getWeekDays())
    const [monthDays, setMonthDays] = useState(getMonthDays())

    // Helper function to determine if an event should be displayed
    const shouldDisplayEvent = (event: Event, date: Date): boolean => {
        const eventStartDate = new Date(event.startDate)
        const eventEndDate = new Date(event.endDate)

        // Reset hours to compare only dates
        const compareDate = new Date(date)
        eventStartDate.setHours(0, 0, 0, 0)
        eventEndDate.setHours(0, 0, 0, 0)
        compareDate.setHours(0, 0, 0, 0)

        return compareDate >= eventStartDate && compareDate <= eventEndDate
    }

    // Inițializăm polling-ul și încărcăm evenimentele la încărcarea paginii
    useEffect(() => {
        // Încărcăm evenimentele din Firestore și setăm un listener pentru actualizări
        setIsDataLoading(true)

        // Creăm un query pentru a obține toate evenimentele, ordonate după data de creare
        const eventsQuery = query(collection(db, EVENTS_COLLECTION), orderBy("createdAt", "desc"))

        // Setăm un listener pentru actualizări în timp real
        const unsubscribe = onSnapshot(
            eventsQuery,
            (snapshot) => {
                const eventsData: Event[] = []

                snapshot.forEach((doc) => {
                    const data = doc.data()
                    eventsData.push({
                        id: doc.id,
                        title: data.title,
                        startTime: data.startTime,
                        endTime: data.endTime,
                        startDate: data.startDate,
                        endDate: data.endDate,
                        color: data.color,
                        type: data.type,
                        clientInfo: data.clientInfo,
                        createdAt: data.createdAt,
                        lastUpdated: data.lastUpdated,
                    })
                })

                // Sortăm evenimentele după dată pentru afișare consistentă
                eventsData.sort((a, b) => {
                    // Sortare primară după dată
                    const dateA = new Date(a.startDate).getTime()
                    const dateB = new Date(b.startDate).getTime()
                    if (dateA !== dateB) return dateA - dateB

                    // Sortare secundară după ora de început
                    const timeA = Number.parseInt(a.startTime.split(":")[0])
                    const timeB = Number.parseInt(b.startTime.split(":")[0])
                    return timeA - timeB
                })

                setEvents(eventsData)
                setIsDataLoading(false)
                setSyncStatus("synced")

                // Dacă există un eveniment selectat, actualizăm și detaliile acestuia
                if (selectedEvent) {
                    const updatedEvent = eventsData.find((e) => e.id === selectedEvent.id)
                    if (updatedEvent) {
                        setSelectedEvent(updatedEvent)
                    }
                }

                // Dacă există un eveniment de tip admin-available selectat, regenerăm sloturile disponibile
                if (selectedEvent && selectedEvent.type === "admin-available" && !isAdmin) {
                    generateAvailableSlots(selectedEvent)
                }
            },
            (error) => {
                console.error("Error fetching events:", error)
                setIsDataLoading(false)
                setSyncStatus("error")
            },
        )

        // Salvăm referința pentru a putea face unsubscribe la demontare
        unsubscribeRef.current = unsubscribe

        // Verificăm dacă există evenimente în colecție
        checkAndInitializeEvents()

        setIsLoaded(true)

        // Curățăm la demontarea componentei
        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current()
            }
        }
    }, [])

    // Actualizăm polling-ul când se schimbă intervalul
    useEffect(() => {
        if (syncEnabled) {
            startPolling()
        }
    }, [syncInterval, syncEnabled])

    // Generate available slots when an admin-available event is clicked
    useEffect(() => {
        if (selectedEvent && selectedEvent.type === "admin-available" && !isAdmin) {
            generateAvailableSlots(selectedEvent)
        }
    }, [selectedEvent, isAdmin])

    // Actualizăm zilele săptămânii și lunii când se schimbă data curentă
    useEffect(() => {
        setWeekDays(getWeekDays())
        setMonthDays(getMonthDays())
    }, [currentDate])

    // Handler pentru storage events (când alte tab-uri modifică localStorage)
    const handleStorageChange = (event: StorageEvent) => {
        if (event.key === STORAGE_KEYS.EVENTS || event.key === STORAGE_KEYS.LAST_UPDATE) {
            // Verificăm dacă datele s-au schimbat
            const storedLastUpdate = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE)

            if (storedLastUpdate && storedLastUpdate !== lastUpdateTime) {
                setSyncStatus("syncing")
                loadEvents()
            }
        }
    }

    // Funcție pentru a porni polling-ul
    const startPolling = () => {
        // Curățăm intervalul existent dacă există
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
        }

        // Dacă sincronizarea este dezactivată, nu pornim polling-ul
        if (!syncEnabled) return

        // Pornim un nou interval
        pollingIntervalRef.current = setInterval(checkForUpdates, syncInterval)
    }

    // Funcție pentru a verifica dacă există actualizări
    const checkForUpdates = () => {
        if (!syncEnabled) return

        try {
            const storedLastUpdate = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE)

            // Dacă există o actualizare mai recentă decât ultima noastră verificare
            if (storedLastUpdate && storedLastUpdate !== lastCheckRef.current) {
                setSyncStatus("syncing")
                loadEvents()
                lastCheckRef.current = storedLastUpdate
            }
        } catch (error) {
            console.error("Error checking for updates:", error)
            setSyncStatus("error")
        }
    }

    // Încărcăm evenimentele din localStorage
    const loadEvents = () => {
        setIsDataLoading(true)
        try {
            const savedEvents = localStorage.getItem(STORAGE_KEYS.EVENTS)
            const savedTimestamp = localStorage.getItem(STORAGE_KEYS.LAST_UPDATE)

            if (savedEvents) {
                const parsedEvents = JSON.parse(savedEvents) as Event[]
                setEvents(parsedEvents)
            }

            if (savedTimestamp) {
                setLastUpdateTime(savedTimestamp)
                lastCheckRef.current = savedTimestamp
            }

            setSyncStatus("synced")
        } catch (error) {
            console.error("Error loading events:", error)
            setSyncStatus("error")
        } finally {
            setIsDataLoading(false)
        }
    }

    // Salvăm evenimentele în localStorage
    const saveEvents = (eventsToSave: Event[] = events) => {
        try {
            const timestamp = new Date().toISOString()

            // Incrementăm contorul de sincronizare
            const currentCounter = Number.parseInt(localStorage.getItem(STORAGE_KEYS.SYNC_COUNTER) || "0")
            localStorage.setItem(STORAGE_KEYS.SYNC_COUNTER, (currentCounter + 1).toString())

            // Salvăm în localStorage
            localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(eventsToSave))
            localStorage.setItem(STORAGE_KEYS.LAST_UPDATE, timestamp)

            // Actualizăm timestamp-ul local
            setLastUpdateTime(timestamp)
            lastCheckRef.current = timestamp

            setSyncStatus("synced")
        } catch (error) {
            console.error("Error saving events:", error)
            setSyncStatus("error")
        }
    }

    // Verificăm dacă există evenimente în colecție și inițializăm cu date de exemplu dacă nu există
    const checkAndInitializeEvents = async () => {
        try {
            const eventsSnapshot = await getDocs(collection(db, EVENTS_COLLECTION))

            // Dacă nu există evenimente, adăugăm câteva exemple
            if (eventsSnapshot.empty) {
                const timestamp = new Date().toISOString()

                // Adăugăm un eveniment de disponibilitate
                await addDoc(collection(db, EVENTS_COLLECTION), {
                    title: "Program Disponibil",
                    startTime: "09:00",
                    endTime: "17:00",
                    startDate: "2025-03-03",
                    endDate: "2025-03-03",
                    color: "bg-green-500",
                    type: "admin-available",
                    createdAt: timestamp,
                    lastUpdated: timestamp,
                })

                // Adăugăm un eveniment de programare
                await addDoc(collection(db, EVENTS_COLLECTION), {
                    title: "Programare: John Doe",
                    startTime: "14:00",
                    endTime: "15:00",
                    startDate: "2025-03-03",
                    endDate: "2025-03-03",
                    color: "bg-purple-500",
                    type: "booked",
                    clientInfo: {
                        firstName: "John",
                        lastName: "Doe",
                        phone: "0712345678",
                    },
                    createdAt: timestamp,
                    lastUpdated: timestamp,
                })
            }
        } catch (error) {
            console.error("Error checking and initializing events:", error)
        }
    }

    // Forțăm reîncărcarea datelor
    const forceRefresh = async () => {
        setSyncStatus("syncing")
        try {
            const eventsSnapshot = await getDocs(collection(db, EVENTS_COLLECTION))
            const eventsData: Event[] = []
            eventsSnapshot.forEach((doc) => {
                const data = doc.data()
                eventsData.push({
                    id: doc.id,
                    title: data.title,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    color: data.color,
                    type: data.type,
                    clientInfo: data.clientInfo,
                    createdAt: data.createdAt,
                    lastUpdated: data.lastUpdated,
                })
            })
            setEvents(eventsData)
            setSyncStatus("synced")
        } catch (error) {
            console.error("Error refreshing events:", error)
            setSyncStatus("error")
        }
    }

    // Activăm/dezactivăm sincronizarea
    const toggleSync = () => {
        setSyncEnabled(!syncEnabled)
        if (!syncEnabled) {
            startPolling()
        } else if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
        }
    }

    // Schimbăm intervalul de sincronizare
    const changeSyncInterval = (newInterval: number) => {
        setSyncInterval(newInterval)
        startPolling()
    }

    // Export events to JSON file
    const exportEvents = () => {
        if (!isAdmin) return

        const dataStr = JSON.stringify(events, null, 2)
        const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`

        const exportFileDefaultName = `calendar-events-${new Date().toISOString().slice(0, 10)}.json`

        const linkElement = document.createElement("a")
        linkElement.setAttribute("href", dataUri)
        linkElement.setAttribute("download", exportFileDefaultName)
        linkElement.click()
    }

    // Import events from JSON file
    const importEvents = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!isAdmin || !event.target.files || event.target.files.length === 0) return

        const file = event.target.files[0]
        const reader = new FileReader()

        reader.onload = async (e) => {
            try {
                setSyncStatus("syncing")
                const importedEvents = JSON.parse(e.target?.result as string) as Event[]

                // Adăugăm fiecare eveniment în Firestore
                for (const event of importedEvents) {
                    const timestamp = new Date().toISOString()

                    await addDoc(collection(db, EVENTS_COLLECTION), {
                        title: event.title,
                        startTime: event.startTime,
                        endTime: event.endTime,
                        startDate: event.startDate,
                        endDate: event.endDate,
                        color: event.color || getRandomColor(),
                        type: event.type,
                        clientInfo: event.clientInfo,
                        createdAt: event.createdAt || timestamp,
                        lastUpdated: timestamp,
                    })
                }

                setSyncStatus("synced")
                alert("Evenimentele au fost importate cu succes!")
            } catch (error) {
                console.error("Error importing events:", error)
                setSyncStatus("error")
                alert("A apărut o eroare la importarea evenimentelor.")
            }
        }

        reader.readAsText(file)
    }

    const handleLogin = () => {
        if (password === ADMIN_PASSWORD) {
            setIsAdmin(true)
            setShowLoginModal(false)
            setLoginError("")
            setPassword("")
        } else {
            setLoginError("Parolă incorectă")
        }
    }

    const handleLogout = () => {
        setIsAdmin(false)
    }

    const handleEventClick = (event: Event) => {
        // If the event is an admin-available slot and user is not admin, show available slots
        if (event.type === "admin-available" && !isAdmin) {
            setSelectedEvent(event)
        } else {
            setSelectedEvent(event)
        }
    }

    // Generate 1-hour slots from admin's available hours
    const generateAvailableSlots = (availableBlock: Event) => {
        const slots: TimeSlot[] = []
        const startHour = Number.parseInt(availableBlock.startTime.split(":")[0])
        const endHour = Number.parseInt(availableBlock.endTime.split(":")[0])

        // Check which slots are already booked - îmbunătățim filtrarea
        const bookedSlots = events.filter(
            (event) => event.type === "booked" && event.startDate === availableBlock.startDate,
        )

        for (let hour = startHour; hour < endHour; hour++) {
            const startTime = `${hour.toString().padStart(2, "0")}:00`
            const endTime = `${(hour + 1).toString().padStart(2, "0")}:00`

            // Check if this slot is already booked - verificare mai precisă
            const isBooked = bookedSlots.some(
                (booking) =>
                    (booking.startTime === startTime && booking.endTime === endTime) ||
                    (Number.parseInt(booking.startTime.split(":")[0]) <= hour &&
                        Number.parseInt(booking.endTime.split(":")[0]) > hour),
            )

            if (!isBooked) {
                slots.push({
                    startTime,
                    endTime,
                    startDate: availableBlock.startDate,
                    endDate: availableBlock.endDate,
                    parentId: availableBlock.id,
                })
            }
        }

        setAvailableSlots(slots)
    }

    const handleAddEvent = async () => {
        if (!isAdmin) return
        if (!newEvent.title) {
            alert("Te rugăm să adaugi un titlu pentru eveniment")
            return
        }

        // Validate dates
        const startDate = new Date(newEvent.startDate)
        const endDate = new Date(newEvent.endDate)
        if (endDate < startDate) {
            alert("Data de sfârșit nu poate fi înainte de data de început")
            return
        }

        setSyncStatus("syncing")

        try {
            const timestamp = new Date().toISOString()

            // Create the event in Firestore
            await addDoc(collection(db, EVENTS_COLLECTION), {
                title: newEvent.title,
                startTime: newEvent.startTime,
                endTime: newEvent.endTime,
                startDate: newEvent.startDate,
                endDate: newEvent.endDate,
                color: "bg-green-500",
                type: newEvent.type,
                createdAt: timestamp,
                lastUpdated: timestamp,
            })

            setShowAddEventModal(false)

            // Reset form
            setNewEvent({
                title: "Interval Disponibil",
                startTime: "09:00",
                endTime: "17:00",
                startDate: new Date().toISOString().split("T")[0],
                endDate: new Date().toISOString().split("T")[0],
                type: "admin-available",
            })
        } catch (error) {
            console.error("Error adding event:", error)
            setSyncStatus("error")
            alert("A apărut o eroare la adăugarea evenimentului.")
        }
    }

    const handleDeleteEvent = async (eventId: string) => {
        if (!isAdmin) return

        setSyncStatus("syncing")

        try {
            // Delete the event from Firestore
            await deleteDoc(doc(db, EVENTS_COLLECTION, eventId))
            setSelectedEvent(null)
        } catch (error) {
            console.error("Error deleting event:", error)
            setSyncStatus("error")
            alert("A apărut o eroare la ștergerea evenimentului.")
        }
    }

    const handleSelectTimeSlot = (slot: TimeSlot) => {
        setSelectedSlot(slot)
        setShowBookingModal(true)
        setSelectedEvent(null)
    }

    const handleBookSlot = async () => {
        // Validate form
        if (!bookingForm.firstName || !bookingForm.lastName || !bookingForm.phone) {
            alert("Te rugăm să completezi toate câmpurile")
            return
        }

        if (!selectedSlot) return

        setSyncStatus("syncing")

        try {
            const timestamp = new Date().toISOString()

            // Create a new booked event in Firestore
            const newBooking = {
                title: `Programare: ${bookingForm.firstName} ${bookingForm.lastName}`,
                startTime: selectedSlot.startTime,
                endTime: selectedSlot.endTime,
                startDate: selectedSlot.startDate,
                endDate: selectedSlot.endDate,
                color: "bg-purple-500",
                type: "booked",
                clientInfo: {
                    firstName: bookingForm.firstName,
                    lastName: bookingForm.lastName,
                    phone: bookingForm.phone,
                },
                createdAt: timestamp,
                lastUpdated: timestamp,
            }

            // Adăugăm evenimentul în Firestore
            await addDoc(collection(db, EVENTS_COLLECTION), newBooking)

            // Reset and close
            setShowBookingModal(false)
            setSelectedSlot(null)
            setBookingForm({
                firstName: "",
                lastName: "",
                phone: "",
            })

            // Show confirmation
            alert("Programare confirmată! Mulțumim.")
        } catch (error) {
            console.error("Error booking slot:", error)
            setSyncStatus("error")
            alert("A apărut o eroare la efectuarea programării.")
        }
    }

    // Get a random color for events
    const getRandomColor = () => {
        const colors = [
            "bg-blue-500",
            "bg-green-500",
            "bg-purple-500",
            "bg-yellow-500",
            "bg-red-500",
            "bg-indigo-500",
            "bg-pink-500",
        ]
        return colors[Math.floor(Math.random() * colors.length)]
    }

    // Sample my calendars
    const myCalendars = [
        { name: "Programări", color: "bg-purple-500" },
        { name: "Intervale Disponibile", color: "bg-green-500" },
    ]

    // Calendar navigation
    const goToNextPeriod = () => {
        const nextDate = new Date(currentDate)
        if (currentView === "week") {
            nextDate.setDate(currentDate.getDate() + 7)
        } else if (currentView === "month") {
            nextDate.setMonth(currentDate.getMonth() + 1)
        }
        setCurrentDate(nextDate)
    }

    const goToPrevPeriod = () => {
        const prevDate = new Date(currentDate)
        if (currentView === "week") {
            prevDate.setDate(currentDate.getDate() - 7)
        } else if (currentView === "month") {
            prevDate.setMonth(currentDate.getMonth() - 1)
        }
        setCurrentDate(prevDate)
    }

    const goToToday = () => {
        setCurrentDate(new Date())
    }

    // Format date for display
    const formatDate = (date: Date) => {
        const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }
        return date.toLocaleDateString("ro-RO", options)
    }

    // Format month for display
    const formatMonth = (date: Date) => {
        const options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }
        return date.toLocaleDateString("ro-RO", options)
    }

    // Time slots for the calendar
    const timeSlots = Array.from({ length: 9 }, (_, i) => i + 8) // 8 AM to 4 PM

    // Helper function to calculate event position and height
    const calculateEventStyle = (startTime: string, endTime: string, eventType: string) => {
        const start = Number.parseInt(startTime.split(":")[0]) + Number.parseInt(startTime.split(":")[1]) / 60
        const end = Number.parseInt(endTime.split(":")[0]) + Number.parseInt(endTime.split(":")[1]) / 60
        const top = (start - 8) * 80 // 80px per hour
        const height = (end - start) * 80

        // Adăugăm z-index diferit în funcție de tipul evenimentului
        // Programările (booked) vor fi deasupra intervalelor disponibile (admin-available)
        const zIndex = eventType === "booked" ? 10 : 5

        return { top: `${top}px`, height: `${height}px`, zIndex }
    }

    // Get event icon based on type
    const getEventIcon = (type: string) => {
        switch (type) {
            case "admin-available":
                return <Clock className="h-3 w-3 mr-1" />
            case "booked":
                return <User className="h-3 w-3 mr-1" />
            default:
                return <Calendar className="h-3 w-3 mr-1" />
        }
    }

    // Get event title based on type and user role
    const getEventTitle = (event: Event) => {
        if (event.type === "booked") {
            // Pentru programări, afișăm titlul complet doar pentru admin
            return isAdmin ? event.title : "Programare ocupată"
        }
        // Pentru alte tipuri de evenimente, afișăm titlul normal
        return event.title
    }

    // Get events for a specific day in month view
    const getEventsForDay = (date: Date) => {
        return events.filter((event) => shouldDisplayEvent(event, date))
    }

    // File input reference for import
    const fileInputRef = React.createRef<HTMLInputElement>()

    // Adaugă această funcție pentru a afișa un indicator pentru sloturile ocupate
    const renderBookedIndicator = (day: Date) => {
        const dayEvents = events.filter((event) => event.type === "booked" && shouldDisplayEvent(event, day))

        if (dayEvents.length === 0) return null

        return (
            <div className="absolute top-1 right-1">
                <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mr-1"></div>
                    <span className="text-xs text-white/70">{dayEvents.length}</span>
                </div>
            </div>
        )
    }

    return (
        <div className="relative min-h-screen w-full overflow-hidden">
            {/* Background Image */}
            <Image
                src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop"
                alt="Beautiful mountain landscape"
                fill
                className="object-cover"
                priority
            />

            {/* Navigation */}
            <header
                className={`absolute top-0 left-0 right-0 z-10 flex flex-col sm:flex-row items-center justify-between px-4 sm:px-8 py-4 sm:py-6 opacity-0 ${isLoaded ? "animate-fade-in" : ""}`}
                style={{ animationDelay: "0.2s" }}
            >
                <div className="flex items-center gap-4 mb-2 sm:mb-0">
                    <Menu className="h-6 w-6 text-white" />
                    <span className="text-xl sm:text-2xl font-semibold text-white drop-shadow-lg">Sistem de Programări</span>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    {/* Sync Status Indicator */}
                    <div className="flex items-center gap-2 mr-2 sm:mr-4">
                        <button
                            onClick={forceRefresh}
                            className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-white hover:bg-white/20 transition-colors"
                        >
                            <RefreshCw className={`h-3 w-3 ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
                            <span className="text-xs hidden sm:inline">
                                {syncStatus === "synced" && "Sincronizat"}
                                {syncStatus === "syncing" && "Sincronizare..."}
                                {syncStatus === "error" && "Eroare sincronizare"}
                            </span>
                        </button>

                        {/* Firebase Indicator */}
                        <div className="flex items-center gap-1 px-2 sm:px-3 py-1 bg-green-500/70 backdrop-blur-sm rounded-full text-white">
                            <Database className="h-3 w-3" />
                            <span className="text-xs hidden sm:inline">Firebase</span>
                        </div>
                    </div>

                    {isAdmin ? (
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1 sm:py-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="text-sm">Ieșire</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowLoginModal(true)}
                            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1 sm:py-2 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors"
                        >
                            <LogIn className="h-4 w-4" />
                            <span className="text-sm">Admin</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="relative h-screen w-full pt-20 flex flex-col md:flex-row">
                {/* Simplified Sidebar */}
                <div
                    className={`w-full md:w-64 h-auto md:h-full bg-white/10 backdrop-blur-lg p-4 shadow-xl border-b md:border-r border-white/20 md:rounded-tr-3xl opacity-0 ${isLoaded ? "animate-fade-in" : ""} flex flex-col justify-between`}
                    style={{ animationDelay: "0.4s" }}
                >
                    <div>
                        {isAdmin && (
                            <button
                                className="mb-6 flex items-center justify-center gap-2 rounded-full bg-blue-500 px-4 py-3 text-white w-full"
                                onClick={() => setShowAddEventModal(true)}
                            >
                                <Plus className="h-5 w-5" />
                                <span>Adaugă Disponibilitate</span>
                            </button>
                        )}

                        {/* Calendar Legend */}
                        <div>
                            <h3 className="text-white font-medium mb-3">Legendă Calendar</h3>
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-sm bg-green-500"></div>
                                    <span className="text-white text-sm">Intervale Disponibile</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-sm bg-purple-500"></div>
                                    <span className="text-white text-sm">Programări</span>
                                </div>
                            </div>
                        </div>

                        {!isAdmin && (
                            <div className="mt-6 p-4 bg-white/10 rounded-lg border border-white/20">
                                <h3 className="text-white font-medium mb-2">Instrucțiuni</h3>
                                <p className="text-white/80 text-sm">
                                    Apasă pe un interval disponibil (verde) pentru a vedea sloturile de o oră disponibile și a face o
                                    programare.
                                </p>
                            </div>
                        )}

                        {isAdmin && (
                            <>
                                <div className="mt-6 p-4 bg-white/10 rounded-lg border border-white/20">
                                    <h3 className="text-white font-medium mb-2">Instrucțiuni Admin</h3>
                                    <p className="text-white/80 text-sm">
                                        Adaugă intervale mari de disponibilitate. Clienții vor putea selecta sloturi de o oră din aceste
                                        intervale.
                                    </p>
                                </div>

                                <div className="mt-6 p-4 bg-white/10 rounded-lg border border-white/20">
                                    <h3 className="text-white font-medium mb-2">Firebase Firestore</h3>
                                    <p className="text-white/80 text-sm">
                                        Datele sunt sincronizate în timp real între toate dispozitivele folosind Firebase Firestore.
                                    </p>
                                </div>

                                <div className="mt-6 space-y-2">
                                    <button
                                        onClick={exportEvents}
                                        className="flex items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-2 text-white w-full hover:bg-white/20 transition-colors"
                                    >
                                        <Download className="h-4 w-4" />
                                        <span>Export Date</span>
                                    </button>

                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center justify-center gap-2 rounded-md bg-white/10 px-4 py-2 text-white w-full hover:bg-white/20 transition-colors"
                                    >
                                        <Upload className="h-4 w-4" />
                                        <span>Import Date</span>
                                    </button>
                                    <input type="file" ref={fileInputRef} onChange={importEvents} accept=".json" className="hidden" />
                                </div>
                            </>
                        )}
                    </div>

                    {/* New position for the big plus button - only for admin */}
                    {isAdmin && (
                        <button
                            className="mt-6 flex items-center justify-center gap-2 rounded-full bg-blue-500 p-4 text-white w-14 h-14 self-start"
                            onClick={() => setShowAddEventModal(true)}
                        >
                            <Plus className="h-6 w-6" />
                        </button>
                    )}
                </div>

                {/* Calendar View */}
                <div
                    className={`flex-1 flex flex-col opacity-0 ${isLoaded ? "animate-fade-in" : ""}`}
                    style={{ animationDelay: "0.6s" }}
                >
                    {/* Calendar Controls */}
                    <div className="flex flex-col sm:flex-row items-center justify-between p-2 sm:p-4 border-b border-white/20">
                        <div className="flex items-center gap-2 sm:gap-4 mb-2 sm:mb-0">
                            <button
                                className="px-2 sm:px-4 py-1 sm:py-2 text-white bg-blue-500 rounded-md text-sm"
                                onClick={goToToday}
                            >
                                Astăzi
                            </button>
                            <div className="flex">
                                <button className="p-1 sm:p-2 text-white hover:bg-white/10 rounded-l-md" onClick={goToPrevPeriod}>
                                    <ChevronLeft className="h-4 sm:h-5 w-4 sm:w-5" />
                                </button>
                                <button className="p-1 sm:p-2 text-white hover:bg-white/10 rounded-r-md" onClick={goToNextPeriod}>
                                    <ChevronRight className="h-4 sm:h-5 w-4 sm:w-5" />
                                </button>
                            </div>
                            <h2 className="text-base sm:text-xl font-semibold text-white">
                                {currentView === "week"
                                    ? `${formatDate(weekDays[0].date)} - ${formatDate(weekDays[6].date)}`
                                    : formatMonth(currentDate)}
                            </h2>
                        </div>

                        <div className="flex items-center gap-2 rounded-md p-1">
                            <button
                                onClick={() => setCurrentView("week")}
                                className={`px-2 sm:px-3 py-1 rounded ${currentView === "week" ? "bg-white/20" : ""} text-white text-xs sm:text-sm`}
                            >
                                Săptămână
                            </button>
                            <button
                                onClick={() => setCurrentView("month")}
                                className={`px-2 sm:px-3 py-1 rounded ${currentView === "month" ? "bg-white/20" : ""} text-white text-xs sm:text-sm`}
                            >
                                Lună
                            </button>
                        </div>
                    </div>

                    {/* Loading Indicator */}
                    {isDataLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-10">
                            <div className="bg-white/20 backdrop-blur-lg p-6 rounded-lg shadow-xl">
                                <div className="flex items-center space-x-3">
                                    <div className="h-5 w-5 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                                    <span className="text-white">Se încarcă datele...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Week View */}
                    {currentView === "week" && (
                        <div className="flex-1 overflow-auto p-4">
                            <div className="bg-white/20 backdrop-blur-lg rounded-xl border border-white/20 shadow-xl h-full">
                                {/* Week Header */}
                                <div className="grid grid-cols-8 border-b border-white/20">
                                    <div className="p-2 text-center text-white/50 text-xs"></div>
                                    {weekDays.map((day, i) => (
                                        <div key={i} className="p-2 text-center border-l border-white/20">
                                            <div className="text-xs text-white/70 font-medium">{day.name}</div>
                                            <div
                                                className={`text-lg font-medium mt-1 text-white ${day.isToday ? "bg-blue-500 rounded-full w-8 h-8 flex items-center justify-center mx-auto" : ""}`}
                                            >
                                                {day.dateNum}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Time Grid */}
                                <div className="grid grid-cols-8">
                                    {/* Time Labels */}
                                    <div className="text-white/70">
                                        {timeSlots.map((time, i) => (
                                            <div key={i} className="h-20 border-b border-white/10 pr-2 text-right text-xs">
                                                {time > 12 ? `${time - 12} PM` : `${time} AM`}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Days Columns */}
                                    {weekDays.map((day, dayIndex) => (
                                        <div key={dayIndex} className="border-l border-white/20 relative">
                                            {timeSlots.map((_, timeIndex) => (
                                                <div key={timeIndex} className="h-20 border-b border-white/10"></div>
                                            ))}

                                            {/* Events */}
                                            {events
                                                .filter((event) => shouldDisplayEvent(event, day.date))
                                                .map((event, i) => {
                                                    const eventStyle = calculateEventStyle(event.startTime, event.endTime, event.type)

                                                    // Determine cursor based on event type and user role
                                                    let cursorClass = "cursor-pointer"
                                                    if (event.type === "booked" && !isAdmin) {
                                                        cursorClass = "cursor-not-allowed"
                                                    }

                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`absolute ${event.color} rounded-md p-2 text-white text-xs shadow-md ${cursorClass} transition-all duration-200 ease-in-out hover:translate-y-[-2px] hover:shadow-lg`}
                                                            style={{
                                                                ...eventStyle,
                                                                left: "4px",
                                                                right: "4px",
                                                            }}
                                                            onClick={() => {
                                                                // Only allow clicking on booked events if admin
                                                                if (event.type === "booked" && !isAdmin) return
                                                                handleEventClick(event)
                                                            }}
                                                        >
                                                            <div className="font-medium flex items-center">
                                                                {getEventIcon(event.type)}
                                                                {getEventTitle(event)}
                                                            </div>
                                                            <div className="opacity-80 text-[10px] mt-1">{`${event.startTime} - ${event.endTime}`}</div>
                                                        </div>
                                                    )
                                                })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Month View */}
                    {currentView === "month" && (
                        <div className="flex-1 overflow-auto p-4">
                            <div className="bg-white/20 backdrop-blur-lg rounded-xl border border-white/20 shadow-xl h-full">
                                {/* Month Header */}
                                <div className="grid grid-cols-7 border-b border-white/20">
                                    {["D", "L", "M", "M", "J", "V", "S"].map((day, i) => (
                                        <div key={i} className="p-2 text-center">
                                            <div className="text-sm text-white/70 font-medium">{day}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Month Grid */}
                                <div className="grid grid-cols-7 grid-rows-6 h-[calc(100%-40px)]">
                                    {monthDays.map((day, i) => (
                                        <div
                                            key={i}
                                            className={`border-b border-r border-white/10 p-1 ${day.isCurrentMonth ? "bg-white/5" : "bg-white/0 text-white/40"} relative min-h-[100px]`}
                                        >
                                            <div
                                                className={`text-sm font-medium ${day.isToday ? "bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center" : ""}`}
                                            >
                                                {day.dateNum}
                                            </div>

                                            {renderBookedIndicator(day.date)}

                                            {/* Events for this day */}
                                            <div className="mt-1 space-y-1 max-h-[80px] overflow-y-auto">
                                                {getEventsForDay(day.date).map((event, eventIndex) => (
                                                    <div
                                                        key={eventIndex}
                                                        className={`${event.color} rounded px-1 py-0.5 text-white text-xs cursor-pointer truncate`}
                                                        onClick={() => {
                                                            if (event.type === "booked" && !isAdmin) return
                                                            handleEventClick(event)
                                                        }}
                                                    >
                                                        <div className="flex items-center">
                                                            {getEventIcon(event.type)}
                                                            <span className="truncate">{getEventTitle(event)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Login Modal */}
                {showLoginModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white/20 backdrop-blur-lg p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-white/30">
                            <h3 className="text-2xl font-bold mb-4 text-white">Autentificare Admin</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-white mb-2">Parolă</label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        placeholder="Introduceți parola"
                                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                                    />
                                    {loginError && <p className="text-red-300 mt-2">{loginError}</p>}
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    className="bg-white/10 text-white px-4 py-2 rounded hover:bg-white/20 transition-colors"
                                    onClick={() => setShowLoginModal(false)}
                                >
                                    Anulare
                                </button>
                                <button
                                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                                    onClick={handleLogin}
                                >
                                    Autentificare
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Event Details Modal */}
                {selectedEvent && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className={`${selectedEvent.color} p-6 rounded-lg shadow-xl max-w-md w-full mx-4`}>
                            <div className="flex justify-between items-start">
                                <h3 className="text-2xl font-bold mb-4 text-white">{getEventTitle(selectedEvent)}</h3>
                                {isAdmin && (
                                    <button
                                        className="text-white/80 hover:text-white"
                                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                            <div className="space-y-3 text-white">
                                <p className="flex items-center">
                                    <Clock className="mr-2 h-5 w-5" />
                                    {`${selectedEvent.startTime} - ${selectedEvent.endTime}`}
                                </p>
                                <p className="flex items-center">
                                    <CalendarIcon className="mr-2 h-5 w-5" />
                                    {new Date(selectedEvent.startDate).toLocaleDateString("ro-RO", { dateStyle: "long" })}
                                    {selectedEvent.startDate !== selectedEvent.endDate &&
                                        ` - ${new Date(selectedEvent.endDate).toLocaleDateString("ro-RO", { dateStyle: "long" })}`}
                                </p>

                                {selectedEvent.type === "booked" && selectedEvent.clientInfo && isAdmin && (
                                    <>
                                        <div className="mt-4 pt-4 border-t border-white/20">
                                            <h4 className="font-semibold mb-2">Informații Client</h4>
                                            <p className="flex items-center">
                                                <User className="mr-2 h-5 w-5" />
                                                {`${selectedEvent.clientInfo.firstName} ${selectedEvent.clientInfo.lastName}`}
                                            </p>
                                            <p className="flex items-center">
                                                <Phone className="mr-2 h-5 w-5" />
                                                {selectedEvent.clientInfo.phone}
                                            </p>
                                        </div>
                                    </>
                                )}

                                {selectedEvent.type === "admin-available" && !isAdmin && (
                                    <>
                                        <div className="mt-4 pt-4 border-t border-white/20">
                                            <h4 className="font-semibold mb-2">Sloturi Disponibile</h4>
                                            <div className="grid grid-cols-2 gap-2 mt-2">
                                                {availableSlots.map((slot, index) => (
                                                    <button
                                                        key={index}
                                                        className="bg-white/20 hover:bg-white/30 text-white rounded p-2 text-sm flex items-center justify-center"
                                                        onClick={() => handleSelectTimeSlot(slot)}
                                                    >
                                                        {slot.startTime} - {slot.endTime}
                                                    </button>
                                                ))}
                                                {availableSlots.length === 0 && (
                                                    <p className="text-white/80 col-span-2 text-center py-2">
                                                        Nu există sloturi disponibile în acest interval.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="mt-6 flex justify-between">
                                {isAdmin && (
                                    <button
                                        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors flex items-center gap-2"
                                        onClick={() => handleDeleteEvent(selectedEvent.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Șterge
                                    </button>
                                )}
                                <button
                                    className="bg-white text-gray-800 px-4 py-2 rounded hover:bg-gray-100 transition-colors ml-auto"
                                    onClick={() => setSelectedEvent(null)}
                                >
                                    Închide
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Booking Modal */}
                {showBookingModal && selectedSlot && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white/20 backdrop-blur-lg p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-white/30">
                            <h3 className="text-2xl font-bold mb-4 text-white">Rezervă Programare</h3>
                            <div className="mb-4 p-3 bg-green-500/20 rounded-lg border border-green-500/30">
                                <p className="text-white text-sm">
                                    <span className="font-semibold">Interval:</span> {selectedSlot.startTime} - {selectedSlot.endTime}
                                </p>
                                <p className="text-white text-sm">
                                    <span className="font-semibold">Data:</span>{" "}
                                    {new Date(selectedSlot.startDate).toLocaleDateString("ro-RO", { dateStyle: "long" })}
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-white mb-2">Prenume</label>
                                    <input
                                        type="text"
                                        value={bookingForm.firstName}
                                        onChange={(e) => setBookingForm({ ...bookingForm, firstName: e.target.value })}
                                        className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        placeholder="Introduceți prenumele"
                                    />
                                </div>
                                <div>
                                    <label className="block text-white mb-2">Nume</label>
                                    <input
                                        type="text"
                                        value={bookingForm.lastName}
                                        onChange={(e) => setBookingForm({ ...bookingForm, lastName: e.target.value })}
                                        className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        placeholder="Introduceți numele"
                                    />
                                </div>
                                <div>
                                    <label className="block text-white mb-2">Număr de telefon</label>
                                    <input
                                        type="tel"
                                        value={bookingForm.phone}
                                        onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                                        className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        placeholder="Introduceți numărul de telefon"
                                    />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-between gap-3">
                                <button
                                    className="bg-white/10 text-white px-4 py-2 rounded hover:bg-white/20 transition-colors"
                                    onClick={() => {
                                        setShowBookingModal(false)
                                        setSelectedSlot(null)
                                    }}
                                >
                                    Anulare
                                </button>
                                <button
                                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors flex items-center gap-2"
                                    onClick={handleBookSlot}
                                >
                                    <Check className="h-4 w-4" />
                                    Confirmă Programarea
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Event Modal - Only for Admin */}
                {showAddEventModal && isAdmin && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white/20 backdrop-blur-lg p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-white/30">
                            <h3 className="text-2xl font-bold mb-4 text-white">Adaugă Interval de Disponibilitate</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-white mb-2">Titlu</label>
                                    <input
                                        type="text"
                                        value={newEvent.title}
                                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                                        className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        placeholder="Titlul intervalului"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-white mb-2">Ora de început</label>
                                        <input
                                            type="time"
                                            value={newEvent.startTime}
                                            onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                                            className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-white mb-2">Ora de sfârșit</label>
                                        <input
                                            type="time"
                                            value={newEvent.endTime}
                                            onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                                            className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-white mb-2">Data de început</label>
                                        <input
                                            type="date"
                                            value={newEvent.startDate}
                                            onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                                            className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-white mb-2">Data de sfârșit</label>
                                        <input
                                            type="date"
                                            value={newEvent.endDate}
                                            onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                                            className="w-full p-2 rounded bg-white/10 border border-white/30 text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-between gap-3">
                                <button
                                    className="bg-white/10 text-white px-4 py-2 rounded hover:bg-white/20 transition-colors"
                                    onClick={() => setShowAddEventModal(false)}
                                >
                                    Anulare
                                </button>
                                <button
                                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                                    onClick={handleAddEvent}
                                    disabled={!newEvent.title}
                                >
                                    Adaugă
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
