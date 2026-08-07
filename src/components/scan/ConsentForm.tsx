"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Glasses } from "lucide-react";
import { saveFormState, getFormState } from "@/lib/storage/scan-storage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const consentSchema = z.object({
  subjectName: z.string().min(1, "Name is required"),
  subjectEmail: z.string().min(1, "Email is required").email("Enter a valid email address"),
  subjectPhone: z.string().min(1, "Phone number is required"),
  consentGiven: z.boolean().refine((value) => value, {
    message: "Please confirm your consent to continue.",
  }),
  adultDeclaration: z.literal(true),
});

export type ConsentValues = z.infer<typeof consentSchema>;

function getSavedDefaultValues(): ConsentValues {
  const saved = getFormState();
  return {
    subjectName: saved.subjectName ?? "",
    subjectEmail: saved.subjectEmail ?? "",
    subjectPhone: saved.subjectPhone ?? "",
    consentGiven: false,
    adultDeclaration: true,
  };
}

export function ConsentForm({ onConsent, busy }: { onConsent: (values: ConsentValues) => void; busy?: boolean }) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ConsentValues>({
    resolver: zodResolver(consentSchema),
    defaultValues: getSavedDefaultValues(),
  });

  const consentGiven = useWatch({ control, name: "consentGiven" });
  const setConsent = (checked: boolean) => setValue("consentGiven", checked, { shouldValidate: true });

  return (
    <Card className="w-full max-w-lg rounded-3xl border-[#eadbca] bg-white shadow-[0_20px_50px_rgba(72,43,24,0.10)]">
      <CardHeader>
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[#a9703e]">Before your scan</p>
        <CardTitle className="font-serif text-3xl font-semibold text-[#3c2718]">Before you start</CardTitle>
        <CardDescription className="leading-6 text-[#755d4a]">
          Three quick clips help create your skin reading. It takes about 20 seconds.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-2xl border border-[#e5c49f] bg-[#fff7ed] p-3.5">
          <Glasses className="mt-0.5 h-5 w-5 shrink-0 text-[#a9703e]" aria-hidden="true" />
          <div className="text-xs leading-relaxed text-[#755d4a]">
            <strong className="mb-0.5 block font-semibold text-[#7d4f29]">Please remove your glasses</strong>
            Remove glasses, sunglasses, or face coverings for a clearer scan.
          </div>
        </div>

        <form
          onSubmit={handleSubmit((values) => {
            saveFormState({
              subjectName: values.subjectName,
              subjectEmail: values.subjectEmail,
              subjectPhone: values.subjectPhone,
            });
            onConsent(values);
          })}
          className="flex flex-col gap-4"
        >
          <Field label="Name" id="subjectName" error={errors.subjectName?.message}>
            <Input id="subjectName" placeholder="Your name" {...register("subjectName")} />
          </Field>
          <Field label="Email" id="subjectEmail" error={errors.subjectEmail?.message}>
            <Input id="subjectEmail" type="email" placeholder="you@example.com" {...register("subjectEmail")} />
          </Field>
          <Field label="Phone" id="subjectPhone" error={errors.subjectPhone?.message}>
            <Input id="subjectPhone" type="tel" placeholder="+91…" {...register("subjectPhone")} />
          </Field>

          <div className="flex items-start gap-2">
            <Checkbox id="consentGiven" checked={Boolean(consentGiven)} onCheckedChange={setConsent} />
            <Label htmlFor="consentGiven" className="font-normal leading-snug text-[#624d3d]">
              I am 18 or older and consent to this face scan. See the{" "}
              <a href="/privacy" className="font-medium text-[#7d4f29] underline underline-offset-2 hover:text-[#3c2718]" onClick={(event) => event.stopPropagation()}>
                Privacy Policy
              </a>{" "}
              for details.
            </Label>
          </div>
          {errors.consentGiven && <p className="text-sm text-[#9e3d3d]">{errors.consentGiven.message}</p>}

          <Button type="submit" disabled={busy} className="mt-2 h-12 rounded-full font-bold">
            {busy ? "Starting…" : "Start face scan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, id, error, children }: { label: string; id: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label} *</Label>
      {children}
      {error && <p className="text-sm text-[#9e3d3d]">{error}</p>}
    </div>
  );
}
