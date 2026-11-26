package main
import "testing"
func TestDITTafonoDefaultVoiceCommands(t *testing.T) {
 commands := defaultVoiceCommands()
 if len(commands) != 22 { t.Fatalf("expected 22 DIT.tafono commands, got %d",len(commands)) }
 if commands[0].Trigger != "a capo" || commands[0].Replacement != "\n" { t.Fatal("first command does not preserve newline") }
 if commands[2].Replacement != "\n\n" { t.Fatal("paragraph replacement must be two newlines") }
 if err := validateVoiceCommands(commands); err != nil { t.Fatal(err) }
}
