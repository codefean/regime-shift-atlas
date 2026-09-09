library(tidyverse)

atlas_dir <- "assets/leaflet-atlas"
atlas_data_dir <- file.path(atlas_dir, "data")
dir.create(atlas_data_dir, recursive = TRUE, showWarnings = FALSE)

site_root_from_atlas <- "../../"

load("assets/cases_db.Rda")
cases <- dat |> janitor::clean_names()

regime_pages <- read_csv("assets/generic_types_RSDB_new.csv", show_col_types = FALSE) |>
  janitor::clean_names() |>
  mutate(
    regime_shift_name = as.character(regime_shift_name),
    regime_shift_url = paste0(site_root_from_atlas, str_replace(filename, "\\.Rmd$", ".html"))
  ) |>
  select(type = regime_shift_name, regime_shift_url)

atlas_cases <- cases |>
  mutate(
    id = as.character(id),
    type = as.character(type),
    case_url = paste0(
      site_root_from_atlas,
      "cs",
      id,
      "_",
      str_to_lower(type) |> str_replace_all(" ", "_"),
      ".html"
    )
  ) |>
  left_join(regime_pages, by = "type")

write_csv(
  atlas_cases,
  file.path(atlas_data_dir, "regime_shift_database.csv"),
  na = ""
)
